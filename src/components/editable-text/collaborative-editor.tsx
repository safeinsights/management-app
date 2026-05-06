'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { Alert, Badge, Box, Group, Paper, Skeleton, Stack, Text } from '@mantine/core'
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
import { parseAuthFailureReason, type AuthFailureCode } from '@/lib/realtime/auth-failure'
import { useConnectionPhase } from '@/lib/realtime/yjs-websocket-context'
import { useTriggerStudyKickOut } from '@/hooks/use-study-status-on-reconnect'
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
    websocketProvider: HocuspocusProviderWebsocket,
    providerRef: React.MutableRefObject<HocuspocusProvider | null>,
    getToken: () => Promise<string | null>,
    onAuthError: (reason: string) => void,
) {
    return useCallback(
        (id: string, yjsDocMap: Map<string, Doc>): Provider => {
            let doc = yjsDocMap.get(id)
            if (!doc) {
                doc = new Doc()
                yjsDocMap.set(id, doc)
            }

            const provider = new HocuspocusProvider({
                websocketProvider,
                name: id,
                document: doc,
                autoConnect: false,
                token: async () => (await getToken()) ?? '',
                onAuthenticationFailed: ({ reason }: { reason: string }) => onAuthError(reason),
            } as ConstructorParameters<typeof HocuspocusProvider>[0])

            // With a shared websocketProvider the constructor leaves manageSocket=false.
            // Without this attach() the document never registers in providerMap.
            provider.attach()

            providerRef.current = provider

            return provider as unknown as Provider
        },
        [websocketProvider, providerRef, getToken, onAuthError],
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
    /**
     * id = globally unique document name; used as the primary key in the `yjs_document` table
     * Include the studyId to prevent collisions across studies, e.g. `review-feedback-${studyId}`.
     */
    id: string
    studyId: string
    /**
     * Tab-singleton Hocuspocus websocket from `useYjsWebsocket()`. Callers must
     * gate render until this is non-null (the singleton is created on first
     * client render, so this is only null during SSR or before hydration).
     */
    websocketProvider: HocuspocusProviderWebsocket
    contentClassName?: string
    contentStyle?: React.CSSProperties
    placeholder?: string
    onChange?: (json: string) => void
    footerRight?: React.ReactNode
}

function EditorUnavailable() {
    return (
        <Alert color="red" title="Editor unavailable">
            We couldn&apos;t connect to the collaboration server. Try refreshing the page — your last saved draft is
            safe.
        </Alert>
    )
}

function ReconnectingBanner() {
    return (
        <Alert color="yellow" mb="sm" title="Working offline">
            You can keep editing — your changes will sync once we reconnect to the collaboration server.
        </Alert>
    )
}

// Auth-failure codes that are NOT a "study no longer editable" kick-out. Anything
// in this set means the editor genuinely cannot show — wrong user, missing token,
// wrong document name. STUDY_NOT_EDITABLE intentionally falls through to the
// kick-out flow handled by useSubmissionRedirectListener / useStudyStatusOnReconnect.
const TERMINAL_AUTH_CODES = new Set<AuthFailureCode>([
    'MISSING_TOKEN',
    'INVALID_TOKEN',
    'UNRECOGNIZED_DOCUMENT',
    'USER_NOT_PROVISIONED',
    'STUDY_NOT_FOUND',
    'NO_MEMBERSHIP',
    'UNKNOWN',
])

export function CollaborativeEditor({
    id,
    studyId,
    websocketProvider,
    contentClassName,
    contentStyle,
    placeholder,
    onChange,
    footerRight,
}: CollaborativeEditorProps) {
    const { user } = useUser()
    const { getToken } = useAuth()
    const providerRef = useRef<HocuspocusProvider | null>(null)
    const [authFailureCode, setAuthFailureCode] = useState<AuthFailureCode | null>(null)
    const phase = useConnectionPhase()
    const triggerKickOut = useTriggerStudyKickOut()
    const username = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Anonymous'
    const cursorColor = pickCursorColor(username)
    const fetchToken = useCallback(async () => getToken(), [getToken])
    const onAuthError = useCallback(
        (reason: string) => {
            const { code } = parseAuthFailureReason(reason)
            setAuthFailureCode(code)
            // Belt-and-braces: a per-document auth failure can fire without the shared
            // websocket dropping (server forcibly closes one handshake), so the page-level
            // reconnect listener wouldn't run. Drive the kick-out check from here too.
            if (code === 'STUDY_NOT_EDITABLE') triggerKickOut()
        },
        [triggerKickOut],
    )
    const providerFactory = useCollaborationProvider(websocketProvider, providerRef, fetchToken, onAuthError)

    // STUDY_NOT_EDITABLE: a peer submitted while we were disconnected. The kick-out
    // flow (toast + redirect) is wired up at the page level; render nothing here so
    // we don't flash a red error before the navigation completes.
    if (authFailureCode === 'STUDY_NOT_EDITABLE') return null

    // Any other auth failure is genuinely terminal — wrong user, missing token,
    // unknown document. Replace the editor.
    if (authFailureCode && TERMINAL_AUTH_CODES.has(authFailureCode)) return <EditorUnavailable />

    if (phase === 'failed') return <EditorUnavailable />

    if (phase === 'initial') return <Skeleton h={contentStyle?.minHeight ?? 200} radius={4} />

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <LexicalCollaboration>
                {phase === 'reconnecting' && <ReconnectingBanner />}
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
