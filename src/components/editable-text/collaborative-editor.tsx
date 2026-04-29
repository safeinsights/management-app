'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { Badge, Box, Group, Paper, Stack, Text } from '@mantine/core'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { Doc } from 'yjs'
import type { Provider } from '@lexical/yjs'

import { isActionError } from '@/lib/errors'
import { formatTimeAgo } from '@/lib/relative-time'
import { getYjsDocumentUpdatedAtAction } from '@/server/actions/editor.actions'
import { lexicalTheme, lexicalNodes, isValidUrl, pickCursorColor } from './config'
import { Toolbar } from './toolbar'
import { EscapeFocusPlugin } from './escape-focus-plugin'
import { TYPING_DEBOUNCE_MS, PERSIST_DELAY_MS, MAX_SAVE_INTERVAL_MS } from '../../../services/editor/constants'

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved'; savedAt: Date }

function useSaveStatus(
    documentId: string,
    studyId: string,
    providerRef: React.RefObject<HocuspocusProvider | null>,
): SaveState {
    const [state, setState] = useState<SaveState>({ status: 'idle' })
    const [now, setNow] = useState(() => new Date())
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastSaveShownRef = useRef<number>(0)
    const hasLocalChangesRef = useRef(false)
    // True when the current debounce window contains local typing — drives whether the
    // settle transition shows the "Saving progress…" choreography (local) or jumps
    // straight to a refreshed "Last saved" timestamp (remote only).
    const localEditPendingRef = useRef(false)

    useEffect(() => {
        getYjsDocumentUpdatedAtAction({ documentName: documentId, studyId }).then((result) => {
            if (!isActionError(result) && result) {
                const savedAt = new Date(result)
                setState({ status: 'saved', savedAt })
                setNow(new Date())
            }
        })
    }, [documentId, studyId])

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30_000)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        const provider = providerRef.current
        if (!provider) return

        const doc = provider.document

        const clearTimers = () => {
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
        }

        const showSaved = () => {
            const saved = new Date()
            lastSaveShownRef.current = Date.now()
            setState({ status: 'saved', savedAt: saved })
            setNow(saved)
        }

        const scheduleIndicator = () => {
            clearTimers()

            const sinceLastSave = Date.now() - lastSaveShownRef.current
            if (lastSaveShownRef.current > 0 && sinceLastSave >= MAX_SAVE_INTERVAL_MS) {
                // Periodic heartbeat during continuous typing — refresh the timestamp
                // without flashing "Saving progress…" regardless of source.
                showSaved()
                return
            }

            typingTimerRef.current = setTimeout(() => {
                if (localEditPendingRef.current) {
                    localEditPendingRef.current = false
                    setState({ status: 'saving' })
                    persistTimerRef.current = setTimeout(showSaved, PERSIST_DELAY_MS)
                } else {
                    // Remote-only window: skip the "Saving progress…" state so passive
                    // readers don't see UI churn for edits that aren't theirs; just
                    // refresh "Last saved" since the document was in fact persisted.
                    showSaved()
                }
            }, TYPING_DEBOUNCE_MS)
        }

        const onUnsyncedChanges = () => {
            if (provider.unsyncedChanges > 0) {
                clearTimers()
                hasLocalChangesRef.current = true
                localEditPendingRef.current = true
                return
            }
            if (!hasLocalChangesRef.current) return
            scheduleIndicator()
        }

        // Remote edits from other clients arrive as Yjs document updates with the provider
        // as the transaction origin. We refresh "Last saved" on remote settle but leave
        // the "Saving progress…" label to local edits only.
        const onDocUpdate = (_update: Uint8Array, origin: unknown) => {
            if (origin !== provider) return
            scheduleIndicator()
        }

        const start = () => {
            provider.on('unsyncedChanges', onUnsyncedChanges)
            doc.on('update', onDocUpdate)
        }

        // Wait for initial sync before tracking, otherwise the Yjs document
        // load triggers events that look like edits.
        const onSynced = () => {
            provider.off('synced', onSynced)
            start()
        }

        if (provider.isSynced) {
            start()
        } else {
            provider.on('synced', onSynced)
        }

        return () => {
            provider.off('synced', onSynced)
            provider.off('unsyncedChanges', onUnsyncedChanges)
            doc.off('update', onDocUpdate)
            clearTimers()
        }
    }, [providerRef])

    if (state.status === 'saved') {
        const ago = formatTimeAgo(state.savedAt, now)
        return ago ? state : { status: 'idle' }
    }
    return state
}

function SaveStatus({
    documentId,
    studyId,
    providerRef,
}: {
    documentId: string
    studyId: string
    providerRef: React.RefObject<HocuspocusProvider | null>
}) {
    const state = useSaveStatus(documentId, studyId, providerRef)

    if (state.status === 'idle') return null

    if (state.status === 'saving') {
        return (
            <Text size="xs" c="dimmed">
                Saving progress…
            </Text>
        )
    }

    const ago = formatTimeAgo(state.savedAt)
    if (!ago) return null

    return (
        <Text size="xs" c="dimmed">
            Last saved {ago}
        </Text>
    )
}

type ActiveEditor = { name: string; color: string; focusing: boolean }

function useActiveEditors(providerRef: React.RefObject<HocuspocusProvider | null>) {
    const [editors, setEditors] = useState<ActiveEditor[]>([])

    useEffect(() => {
        const provider = providerRef.current
        if (!provider) return

        const awareness = provider.awareness!

        const update = () => {
            const states: ActiveEditor[] = []
            awareness.getStates().forEach((state, clientId) => {
                if (clientId !== awareness.clientID && state.name) {
                    states.push({ name: state.name, color: state.color, focusing: state.focusing })
                }
            })
            setEditors(states)
        }

        awareness.on('change', update)
        update()

        return () => {
            awareness.off('change', update)
        }
    }, [providerRef])

    return editors
}

function ActiveEditorsList({ providerRef }: { providerRef: React.RefObject<HocuspocusProvider | null> }) {
    const editors = useActiveEditors(providerRef)

    if (editors.length === 0) return null

    return (
        <Group gap="xs">
            <Text size="xs" c="dimmed">
                Also editing:
            </Text>
            {editors.map((editor) => (
                <Badge key={editor.name} color={editor.color} variant="light" size="sm">
                    {editor.name}
                </Badge>
            ))}
        </Group>
    )
}

function EditorChangePlugin({ onChange }: { onChange: (json: string) => void }) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            onChange(JSON.stringify(editorState.toJSON()))
        })
    }, [editor, onChange])

    return null
}

function useCollaborationProvider(
    wsUrl: string | undefined,
    websocketProvider: HocuspocusProviderWebsocket | undefined,
    studyId: string,
    providerRef: React.MutableRefObject<HocuspocusProvider | null>,
) {
    return useCallback(
        (id: string, yjsDocMap: Map<string, Doc>): Provider => {
            let doc = yjsDocMap.get(id)
            if (!doc) {
                doc = new Doc()
                yjsDocMap.set(id, doc)
            }

            const baseOptions = {
                name: id,
                document: doc,
                autoConnect: false,
                token: studyId,
            }

            const options = websocketProvider ? { ...baseOptions, websocketProvider } : { ...baseOptions, url: wsUrl }

            const provider = new HocuspocusProvider(options as ConstructorParameters<typeof HocuspocusProvider>[0])

            // When a shared websocketProvider is passed, the HocuspocusProvider constructor
            // does NOT auto-attach (manageSocket stays false). We have to register manually
            // so the shared connection knows to sync this document. URL-based providers
            // attach themselves from the constructor automatically.
            if (websocketProvider) {
                provider.attach()
            }

            providerRef.current = provider

            return provider as unknown as Provider
        },
        [wsUrl, websocketProvider, studyId, providerRef],
    )
}

export type CollaborativeEditorProps = {
    /**
     * id = globally unique document name; used as the primary key in the `yjs_document` table
     * Include the studyId to prevent collisions across studies, e.g. `review-feedback-${studyId}`.
     */
    id: string
    studyId: string
    /** Required when websocketProvider is not provided. */
    wsUrl?: string
    /**
     * Optional pre-built shared websocket provider. When supplied, all editors on the page
     * multiplex over a single TCP/WebSocket connection.
     */
    websocketProvider?: HocuspocusProviderWebsocket
    contentClassName?: string
    contentStyle?: React.CSSProperties
    placeholder?: string
    onChange?: (json: string) => void
    /**
     * Initial Lexical editor state JSON. Used together with shouldBootstrap to seed a
     * brand-new Y.Doc from existing DB content the first time it is opened.
     */
    initialContent?: string
    /**
     * Pass true only when the Y.Doc has no persisted state yet (caller verified via
     * getYjsDocumentUpdatedAtAction). The CollaborationPlugin will initialize the Y.Doc
     * from initialContent. Otherwise leave undefined/false and let the doc sync from server.
     */
    shouldBootstrap?: boolean
    footerRight?: React.ReactNode
}

export function CollaborativeEditor({
    id,
    studyId,
    wsUrl,
    websocketProvider,
    contentClassName,
    contentStyle,
    placeholder,
    onChange,
    initialContent,
    shouldBootstrap,
    footerRight,
}: CollaborativeEditorProps) {
    const { user } = useUser()
    const providerRef = useRef<HocuspocusProvider | null>(null)
    const username = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Anonymous'
    const cursorColor = pickCursorColor(username)
    const providerFactory = useCollaborationProvider(wsUrl, websocketProvider, studyId, providerRef)

    // Lexical's collaboration guide is explicit: initialConfig.editorState MUST be null
    // when CollaborationPlugin is in use; the plugin owns the Y.Doc seeding via its own
    // initialEditorState prop (passed below).
    const initialConfig = {
        namespace: 'collaborative-editor',
        theme: lexicalTheme,
        nodes: lexicalNodes,
        editorState: null,
        onError: (error: Error) => console.error('Lexical error:', error),
    }

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <LexicalCollaboration>
                <Paper
                    p={0}
                    className="collaborative-editor-container"
                    style={{ overflow: 'hidden', position: 'relative' }}
                >
                    <RichTextPlugin
                        contentEditable={<ContentEditable className={contentClassName} style={contentStyle} />}
                        placeholder={
                            placeholder ? (
                                <Text
                                    c="dimmed"
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        padding: contentStyle?.padding,
                                        pointerEvents: 'none',
                                    }}
                                >
                                    {placeholder}
                                </Text>
                            ) : null
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <CollaborationPlugin
                        id={id}
                        providerFactory={providerFactory}
                        shouldBootstrap={shouldBootstrap ?? false}
                        initialEditorState={shouldBootstrap ? initialContent : undefined}
                        username={username}
                        cursorColor={cursorColor}
                    />
                    {onChange && <EditorChangePlugin onChange={onChange} />}
                    <ListPlugin />
                    <TabIndentationPlugin />
                    <EscapeFocusPlugin />
                    <LinkPlugin validateUrl={isValidUrl} />
                    <Toolbar />
                </Paper>
                <Stack gap={4} mt="xs">
                    <Group align="center" wrap="nowrap">
                        <SaveStatus documentId={id} studyId={studyId} providerRef={providerRef} />
                        {footerRight && <Box ml="auto">{footerRight}</Box>}
                    </Group>
                    <ActiveEditorsList providerRef={providerRef} />
                </Stack>
            </LexicalCollaboration>
        </LexicalComposer>
    )
}
