'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { Alert, Badge, Group, Skeleton, Stack, Text } from '@mantine/core'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { Doc } from 'yjs'
import type { Provider } from '@lexical/yjs'

import { parseAuthFailureReason, type AuthFailureCode } from '@/lib/realtime/auth-failure'
import { useConnectionPhase } from '@/lib/realtime/yjs-websocket-context'
import { useProviderSaveStatus } from '@/lib/realtime/use-provider-save-status'
import { useTriggerStudyKickOut } from '@/hooks/use-study-status-on-reconnect'
import { SaveStatusIndicator } from '@/components/save-status'
import { EditorFooter } from './editor-footer'
import { EditorSurface, resolveContentHeight } from './editor-surface'
import { lexicalTheme, lexicalNodes, isValidUrl, linkAttributes, pickCursorColor } from './config'
import { EscapeFocusPlugin } from './escape-focus-plugin'
import { useWidgetBlur } from '@/components/form-field'

function SaveStatus({ provider, isVisible }: { provider: HocuspocusProvider | null; isVisible: boolean }) {
    const status = useProviderSaveStatus(provider)
    return <SaveStatusIndicator status={status} isVisible={isVisible} />
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

function EditorChangePlugin({ onChange }: { onChange: (json: string) => void }) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            const json = editorState.toJSON()
            // Before Yjs syncs, Lexical's root briefly has no children, a state it rejects on
            // re-hydration. User-cleared input keeps an empty paragraph, so it is unaffected.
            if (!json.root?.children?.length) return
            onChange(JSON.stringify(json))
        })
    }, [editor, onChange])

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

            // With a shared websocketProvider the constructor leaves manageSocket=false, so
            // without this the document never registers in providerMap.
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
    /** Primary key in `yjs_document`; include the studyId to avoid collisions across studies. */
    id: string
    /** Not read by the editor itself; retained for call-site identity. */
    studyId: string
    /** Callers must gate render until this is non-null (SSR and pre-hydration only). */
    websocketProvider: HocuspocusProviderWebsocket
    contentClassName?: string
    contentStyle?: React.CSSProperties
    placeholder?: string
    ariaLabel?: string
    onChange?: (json: string) => void
    footerLeft?: React.ReactNode
    footerRight?: React.ReactNode
    /** DOM id for the focusable surface. Distinct from `id`, which names the Yjs document. */
    inputId?: string
    /** `string` not `ReactNode`, so a falsy node cannot read as "no error". */
    error?: string | null
    ariaDescribedBy?: string
    ariaRequired?: boolean
    /** Fires only when focus leaves the whole editor, toolbar included. */
    onBlur?: () => void
    contentHeight?: number
    isResizable?: boolean
    /** Siblings must share the provider: two with the same name collide in providerMap. */
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

// STUDY_NOT_EDITABLE is absent so it falls through to the page-level kick-out; INFRA_UNAVAILABLE
// is absent because it is recoverable and drives a retry (OTTER-626).
const TERMINAL_AUTH_CODES = new Set<AuthFailureCode>([
    'MISSING_TOKEN',
    'INVALID_TOKEN',
    'UNRECOGNIZED_DOCUMENT',
    'USER_NOT_PROVISIONED',
    'STUDY_NOT_FOUND',
    'NO_MEMBERSHIP',
    'UNKNOWN',
])

// Gives the editor service time to self-heal its DB pool before we retry.
const INFRA_RETRY_DELAY_MS = 5000

export function CollaborativeEditor({
    id,
    websocketProvider,
    contentClassName,
    contentStyle,
    placeholder,
    ariaLabel,
    onChange,
    footerLeft,
    footerRight,
    inputId,
    error,
    ariaDescribedBy,
    ariaRequired,
    onBlur,
    contentHeight,
    isResizable,
    onProviderReady,
}: CollaborativeEditorProps) {
    const { user } = useUser()
    const { getToken } = useAuth()
    const widgetBlur = useWidgetBlur<HTMLDivElement>(onBlur)
    const providerRef = useRef<HocuspocusProvider | null>(null)
    // Mirrors providerRef: the ref gives the factory synchronous access, the state lets the
    // cleanup effect depend on the provider value.
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
            // A per-document failure can fire without the shared websocket dropping, so the
            // page-level reconnect listener would not run.
            if (code === 'STUDY_NOT_EDITABLE') triggerKickOut()
            // The handshake closed this one provider while the shared transport stayed up, so
            // nothing else will retry it.
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

    // Strict-mode cleanup detaches the provider, so re-attach to keep it in providerMap.
    // attach() is idempotent, making this a no-op on first mount.
    useEffect(() => {
        if (providerRef.current) {
            providerRef.current.attach()
            publishProvider(providerRef.current)
        }
        return () => {
            publishProvider(null)
        }
    }, [publishProvider])

    // Dropping the per-document subscription gives re-entering peers a fresh server Connection
    // with full awareness of who is already editing.
    useEffect(() => {
        if (!activeProvider) return
        return () => {
            activeProvider.awareness?.setLocalState(null)
            activeProvider.detach()
        }
    }, [activeProvider])

    useEffect(
        () => () => {
            if (infraRetryTimer.current) clearTimeout(infraRetryTimer.current)
        },
        [],
    )

    // The kick-out flow runs at the page level; render nothing so no red error flashes before
    // the navigation completes.
    if (authFailureCode === 'STUDY_NOT_EDITABLE') return null

    if (authFailureCode && TERMINAL_AUTH_CODES.has(authFailureCode)) return <EditorUnavailable />

    if (phase === 'failed') return <EditorUnavailable />

    // Same resolution the surface uses, so the skeleton matches the mounted height and the
    // page does not jump.
    if (phase === 'initial') return <Skeleton h={resolveContentHeight(contentHeight, contentStyle)} radius={4} />

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <LexicalCollaboration>
                {(phase === 'reconnecting' || authFailureCode === 'INFRA_UNAVAILABLE') && <ReconnectingBanner />}
                <EditorSurface
                    inputId={inputId}
                    contentClassName={contentClassName}
                    contentStyle={contentStyle}
                    placeholder={placeholder}
                    ariaLabel={ariaLabel}
                    ariaDescribedBy={ariaDescribedBy}
                    ariaRequired={ariaRequired}
                    error={error}
                    widgetBlur={widgetBlur}
                    contentHeight={contentHeight}
                    isResizable={isResizable}
                >
                    <CollaborationPlugin
                        id={id}
                        providerFactory={providerFactory}
                        shouldBootstrap={false}
                        username={username}
                        cursorColor={cursorColor}
                        awarenessData={awarenessData}
                    />
                    {onChange && <EditorChangePlugin onChange={onChange} />}
                    <ListPlugin />
                    {/* No TabIndentationPlugin: banned in eslint.config.mjs, which carries the why. */}
                    <EscapeFocusPlugin />
                    <LinkPlugin validateUrl={isValidUrl} attributes={linkAttributes} />
                </EditorSurface>
                <Stack gap={4} mt={4}>
                    <EditorFooter left={footerLeft} right={footerRight}>
                        <SaveStatus provider={activeProvider} isVisible={!error} />
                    </EditorFooter>
                    <ActiveEditorsList providerRef={providerRef} currentUserId={userId} />
                </Stack>
            </LexicalCollaboration>
        </LexicalComposer>
    )
}
