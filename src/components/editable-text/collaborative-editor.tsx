'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { Badge, Group, Paper, Text } from '@mantine/core'
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
import { HocuspocusProvider } from '@hocuspocus/provider'
import { Doc } from 'yjs'
import type { Provider } from '@lexical/yjs'

import { formatTimeAgo } from '@/lib/relative-time'
import { getYjsDocumentUpdatedAtAction } from '@/server/actions/editor.actions'
import { lexicalTheme, lexicalNodes, isValidUrl, pickCursorColor } from './config'
import { Toolbar } from './toolbar'
import { EscapeFocusPlugin } from './escape-focus-plugin'

// These align with the editor service's Server config (debounce: 2000, maxDebounce: 30_000).
// TYPING_DEBOUNCE_MS waits for typing to stop before showing "Saving progress…".
// PERSIST_DELAY_MS is the brief window while the server writes to the database.
// MAX_SAVE_INTERVAL_MS triggers a save indicator during continuous typing.
const TYPING_DEBOUNCE_MS = 2000
const PERSIST_DELAY_MS = 1000
const MAX_SAVE_INTERVAL_MS = 30_000

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved'; savedAt: Date }

function useSaveStatus(documentId: string, providerRef: React.RefObject<HocuspocusProvider | null>): SaveState {
    const [state, setState] = useState<SaveState>({ status: 'idle' })
    const [now, setNow] = useState(() => new Date())
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastSaveShownRef = useRef<number>(0)
    const hasLocalChangesRef = useRef(false)

    useEffect(() => {
        getYjsDocumentUpdatedAtAction(documentId).then((iso) => {
            if (iso) {
                const savedAt = new Date(iso)
                setState({ status: 'saved', savedAt })
                setNow(new Date())
            }
        })
    }, [documentId])

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30_000)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        const provider = providerRef.current
        if (!provider) return

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

        const onUnsyncedChanges = () => {
            clearTimers()

            if (provider.unsyncedChanges > 0) {
                hasLocalChangesRef.current = true
                return
            }

            if (!hasLocalChangesRef.current) return

            const sinceLastSave = Date.now() - lastSaveShownRef.current
            if (lastSaveShownRef.current > 0 && sinceLastSave >= MAX_SAVE_INTERVAL_MS) {
                showSaved()
                return
            }

            typingTimerRef.current = setTimeout(() => {
                setState({ status: 'saving' })
                persistTimerRef.current = setTimeout(showSaved, PERSIST_DELAY_MS)
            }, TYPING_DEBOUNCE_MS)
        }

        // Wait for initial sync before tracking, otherwise the Yjs document
        // load triggers unsyncedChanges events that look like local edits.
        const onSynced = () => {
            provider.off('synced', onSynced)
            provider.on('unsyncedChanges', onUnsyncedChanges)
        }

        if (provider.isSynced) {
            provider.on('unsyncedChanges', onUnsyncedChanges)
        } else {
            provider.on('synced', onSynced)
        }

        return () => {
            provider.off('synced', onSynced)
            provider.off('unsyncedChanges', onUnsyncedChanges)
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
    providerRef,
}: {
    documentId: string
    providerRef: React.RefObject<HocuspocusProvider | null>
}) {
    const state = useSaveStatus(documentId, providerRef)

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

function useCollaborationProvider(wsUrl: string, providerRef: React.MutableRefObject<HocuspocusProvider | null>) {
    return useCallback(
        (id: string, yjsDocMap: Map<string, Doc>): Provider => {
            let doc = yjsDocMap.get(id)
            if (!doc) {
                doc = new Doc()
                yjsDocMap.set(id, doc)
            }

            const provider = new HocuspocusProvider({
                url: wsUrl,
                name: id,
                document: doc,
                autoConnect: false,
            } as ConstructorParameters<typeof HocuspocusProvider>[0])

            providerRef.current = provider

            return provider as unknown as Provider
        },
        [wsUrl, providerRef],
    )
}

const initialConfig = {
    namespace: 'collaborative-editor',
    theme: lexicalTheme,
    nodes: lexicalNodes,
    editorState: null,
    onError: (error: Error) => console.error('Lexical error:', error),
}

export type CollaborativeEditorProps = {
    id: string
    wsUrl: string
    contentClassName?: string
    contentStyle?: React.CSSProperties
    placeholder?: string
    onChange?: (json: string) => void
}

export function CollaborativeEditor({
    id,
    wsUrl,
    contentClassName,
    contentStyle,
    placeholder,
    onChange,
}: CollaborativeEditorProps) {
    const { user } = useUser()
    const providerRef = useRef<HocuspocusProvider | null>(null)
    const username = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Anonymous'
    const cursorColor = pickCursorColor(username)
    const providerFactory = useCollaborationProvider(wsUrl, providerRef)

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
                        shouldBootstrap={false}
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
                <Group justify="space-between" mt="xs">
                    <ActiveEditorsList providerRef={providerRef} />
                    <SaveStatus documentId={id} providerRef={providerRef} />
                </Group>
            </LexicalCollaboration>
        </LexicalComposer>
    )
}
