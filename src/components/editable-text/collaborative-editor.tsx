'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

import { parseAuthFailureReason, type AuthFailureCode } from '@/lib/realtime/auth-failure'
import { useConnectionPhase } from '@/lib/realtime/yjs-websocket-context'
import { useProviderSaveStatus } from '@/lib/realtime/use-provider-save-status'
import { useTriggerStudyKickOut } from '@/hooks/use-study-status-on-reconnect'
import { SaveStatusIndicator } from '@/components/save-status'
import { lexicalTheme, lexicalNodes, isValidUrl, pickCursorColor } from './config'
import { Toolbar } from './toolbar'
import { EscapeFocusPlugin } from './escape-focus-plugin'

function SaveStatus({ provider }: { provider: HocuspocusProvider | null }) {
    const status = useProviderSaveStatus(provider)
    return <SaveStatusIndicator status={status} />
}

type ActiveEditor = { userId: string; name: string; color: string; focusing: boolean }

export function useActiveEditors(
    providerRef: React.RefObject<HocuspocusProvider | null>,
    currentUserId: string | undefined,
) {
    const [editors, setEditors] = useState<ActiveEditor[]>([])

    useEffect(() => {
        const provider = providerRef.current
        if (!provider) return

        const awareness = provider.awareness!

        const update = () => {
            const seen = new Map<string, ActiveEditor>()
            awareness.getStates().forEach((state, clientId) => {
                if (clientId === awareness.clientID || !state.name) return
                const userId = state.awarenessData?.userId
                if (userId === currentUserId) return
                const key = userId ?? `client-${clientId}`
                const existing = seen.get(key)
                if (!existing || (!existing.focusing && state.focusing)) {
                    seen.set(key, { userId: key, name: state.name, color: state.color, focusing: state.focusing })
                }
            })
            setEditors(Array.from(seen.values()))
        }

        awareness.on('change', update)
        update()

        return () => {
            awareness.off('change', update)
        }
    }, [providerRef, currentUserId])

    return editors
}

function ActiveEditorsList({
    providerRef,
    currentUserId,
}: {
    providerRef: React.RefObject<HocuspocusProvider | null>
    currentUserId: string | undefined
}) {
    const editors = useActiveEditors(providerRef, currentUserId)

    if (editors.length === 0) return null

    return (
        <Group gap="xs">
            <Text size="xs" c="dimmed">
                Also editing:
            </Text>
            {editors.map((editor) => (
                <Badge key={editor.userId} color={editor.color} variant="light" size="sm">
                    {editor.name}
                </Badge>
            ))}
        </Group>
    )
}

function EditorChangePlugin({
    onChange,
    onLocalUserEdit,
}: {
    onChange?: (json: string) => void
    onLocalUserEdit?: () => void
}) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
            const json = editorState.toJSON()
            // On mount, before Yjs syncs, Lexical's root briefly has no children.
            // That state is valid in memory but Lexical rejects it on re-hydration,
            // so persisting it would crash the non-collaborative views (EditableText,
            // ReadOnlyLexicalContent) the next time the data is read. User-cleared
            // input still keeps an empty paragraph in children, so this only filters
            // the pre-sync state.
            if (!json.root?.children?.length) return
            // OTTER-636: a local user edit is one that (a) actually mutated content, and (b) did NOT
            // originate from Yjs sync (`collaboration`) or the initial hydration merge (`history-merge`).
            // Lexical fires this listener on selection-only updates too (focus / cursor move), where
            // dirtyElements+dirtyLeaves are empty — those are NOT edits (card non-trigger) and must never
            // flip the study to a draft. A remote collaborator's own client signals for them.
            const contentChanged = dirtyElements.size > 0 || dirtyLeaves.size > 0
            if (onLocalUserEdit && contentChanged && !tags.has('collaboration') && !tags.has('history-merge')) {
                onLocalUserEdit()
            }
            onChange?.(JSON.stringify(json))
        })
    }, [editor, onChange, onLocalUserEdit])

    return null
}

function useCollaborationProvider(
    websocketProvider: HocuspocusProviderWebsocket,
    providerRef: React.MutableRefObject<HocuspocusProvider | null>,
    getToken: () => Promise<string | null>,
    onAuthError: (reason: string) => void,
    onProviderReady?: (provider: HocuspocusProvider | null) => void,
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
            onProviderReady?.(provider)

            return provider as unknown as Provider
        },
        [websocketProvider, providerRef, getToken, onAuthError, onProviderReady],
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
    /** Retained for call-site identity/collision context; not read by the editor itself. */
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
    ariaLabel?: string
    onChange?: (json: string) => void
    /**
     * OTTER-636: fires on the first and every subsequent *local* user edit (not on Yjs hydration or
     * remote collaborator updates). Used to transition a change-requested proposal to a revision draft
     * the moment the researcher actually edits it.
     */
    onLocalUserEdit?: () => void
    footerRight?: React.ReactNode
    /**
     * Called once Lexical's CollaborationPlugin instantiates the provider, and
     * again with null on teardown. Consumers (e.g. siblings that need to
     * subscribe to stateless events on the same document) use this to share
     * the editor's provider rather than constructing their own — two providers
     * with the same name on the shared websocket collide in providerMap.
     */
    onProviderReady?: (provider: HocuspocusProvider | null) => void
}

function EditorUnavailable() {
    return (
        <Alert color="red" title="Editor unavailable">
            We couldn’t connect to the collaboration server. Try refreshing the page — your last saved draft is safe.
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
// INFRA_UNAVAILABLE is deliberately absent: it is recoverable and drives a retry,
// not a terminal banner (OTTER-626).
const TERMINAL_AUTH_CODES = new Set<AuthFailureCode>([
    'MISSING_TOKEN',
    'INVALID_TOKEN',
    'UNRECOGNIZED_DOCUMENT',
    'USER_NOT_PROVISIONED',
    'STUDY_NOT_FOUND',
    'NO_MEMBERSHIP',
    'UNKNOWN',
])

// How long to wait before re-attempting a connection that failed with
// INFRA_UNAVAILABLE, giving the editor service time to self-heal its DB pool.
const INFRA_RETRY_DELAY_MS = 5000

export function CollaborativeEditor({
    id,
    websocketProvider,
    contentClassName,
    contentStyle,
    placeholder,
    ariaLabel,
    onChange,
    onLocalUserEdit,
    footerRight,
    onProviderReady,
}: CollaborativeEditorProps) {
    const { user } = useUser()
    const { getToken } = useAuth()
    const providerRef = useRef<HocuspocusProvider | null>(null)
    // State mirror of providerRef — the ref is needed for synchronous access in
    // the factory callback; state is needed so the cleanup effect can depend on
    // the provider value.
    const [activeProvider, setActiveProvider] = useState<HocuspocusProvider | null>(null)
    const [authFailureCode, setAuthFailureCode] = useState<AuthFailureCode | null>(null)
    const infraRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const phase = useConnectionPhase()
    const triggerKickOut = useTriggerStudyKickOut()
    const userId = user?.id
    const username = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Anonymous'
    const cursorColor = pickCursorColor(username)
    const awarenessData = useMemo(() => ({ userId }), [userId])
    const fetchToken = useCallback(async () => getToken(), [getToken])
    const onAuthError = useCallback(
        (reason: string) => {
            const { code, message } = parseAuthFailureReason(reason)
            console.error('[collaborative-editor] auth failed', { documentName: id, code, message, reason })
            setAuthFailureCode(code)
            // Belt-and-braces: a per-document auth failure can fire without the shared
            // websocket dropping (server forcibly closes one handshake), so the page-level
            // reconnect listener wouldn't run. Drive the kick-out check from here too.
            if (code === 'STUDY_NOT_EDITABLE') triggerKickOut()
            // INFRA_UNAVAILABLE means the server's DB was momentarily unreachable, not
            // that we're unauthorized. The handshake closed this one provider while the
            // shared transport stayed up, so nothing else will retry it — re-attempt the
            // connection after a backoff. Clearing the code drops the banner once the
            // retry's handshake succeeds.
            if (code === 'INFRA_UNAVAILABLE') {
                if (infraRetryTimer.current) clearTimeout(infraRetryTimer.current)
                infraRetryTimer.current = setTimeout(() => {
                    setAuthFailureCode(null)
                    providerRef.current?.connect()
                }, INFRA_RETRY_DELAY_MS)
            }
        },
        [id, triggerKickOut],
    )
    const publishProvider = useCallback(
        (provider: HocuspocusProvider | null) => {
            setActiveProvider(provider)
            onProviderReady?.(provider)
        },
        [onProviderReady],
    )
    const providerFactory = useCollaborationProvider(
        websocketProvider,
        providerRef,
        fetchToken,
        onAuthError,
        publishProvider,
    )

    // Strict-mode cleanup detaches the provider; re-attach and re-publish so
    // the provider stays in providerMap and subscribers don't stay on null.
    // attach() is idempotent — on first mount this is a no-op.
    useEffect(() => {
        if (providerRef.current) {
            providerRef.current.attach()
            publishProvider(providerRef.current)
        }
        return () => {
            publishProvider(null)
        }
    }, [publishProvider])

    // Clean up the per-document subscription so re-entering peers get a fresh
    // server Connection with full awareness of who's already editing.
    useEffect(() => {
        if (!activeProvider) return
        return () => {
            activeProvider.awareness?.setLocalState(null)
            activeProvider.detach()
        }
    }, [activeProvider])

    // Cancel any pending INFRA_UNAVAILABLE retry on unmount.
    useEffect(
        () => () => {
            if (infraRetryTimer.current) clearTimeout(infraRetryTimer.current)
        },
        [],
    )

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
                {(phase === 'reconnecting' || authFailureCode === 'INFRA_UNAVAILABLE') && <ReconnectingBanner />}
                <Paper
                    p={0}
                    className="collaborative-editor-container"
                    style={{ overflow: 'hidden', position: 'relative' }}
                >
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable className={contentClassName} style={contentStyle} ariaLabel={ariaLabel} />
                        }
                        placeholder={
                            placeholder ? (
                                <Text
                                    c="dimmed"
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        padding: contentStyle?.padding,
                                        fontSize: contentStyle?.fontSize,
                                        lineHeight: contentStyle?.lineHeight,
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
                        awarenessData={awarenessData}
                    />
                    {(onChange || onLocalUserEdit) && (
                        <EditorChangePlugin onChange={onChange} onLocalUserEdit={onLocalUserEdit} />
                    )}
                    <ListPlugin />
                    <TabIndentationPlugin />
                    <EscapeFocusPlugin />
                    <LinkPlugin validateUrl={isValidUrl} />
                    <Toolbar />
                </Paper>
                <Stack gap={4} mt={4}>
                    <Group align="center" wrap="nowrap">
                        <SaveStatus provider={activeProvider} />
                        {footerRight && <Box ml="auto">{footerRight}</Box>}
                    </Group>
                    <ActiveEditorsList providerRef={providerRef} currentUserId={userId} />
                </Stack>
            </LexicalCollaboration>
        </LexicalComposer>
    )
}
