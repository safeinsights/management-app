import { cssVariablesResolver, theme } from '@/theme'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { SpyModeProvider, useSpyMode } from '@/components/spy-mode-context'
import { SessionInfoProvider } from '@/components/layout/session-info-context'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { CURRENT_USER_INFO_KEY, useSession as useAppSession } from '@/hooks/session'
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import * as RouterMock from 'next-router-mock'
import { FC, ReactElement, ReactNode, useEffect } from 'react'
import { renderToString } from 'react-dom/server'
import { vi } from 'vitest'
import { getMockedLayoutUserInfo } from './layout-user-info'
import { createTestQueryClient } from './query-client'

// A test of the client fetch passes `sessionInfo: null`, as the layout does when it has no session.
type SessionInfoOption = { sessionInfo?: UserInfo | null }
const layoutUserInfo = (options?: SessionInfoOption) =>
    options && 'sessionInfo' in options ? (options.sessionInfo ?? null) : getMockedLayoutUserInfo()

// For `renderHook(..., { wrapper: createTestQueryWrapper() })`.
export const createTestQueryWrapper = (options?: SessionInfoOption & { queryClient?: QueryClient }) => {
    const client = options?.queryClient ?? createTestQueryClient()
    const Wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
            <SessionInfoProvider userInfo={layoutUserInfo(options)}>{children}</SessionInfoProvider>
        </QueryClientProvider>
    )
    Wrapper.displayName = 'QueryClientWrapper'
    return Wrapper
}

type ProviderOptions = SessionInfoOption & { singleUserEditing?: boolean; queryClient?: QueryClient }

/**
 * `singleUserEditing` swaps the collaborative editors for the standalone Lexical surface, putting
 * the editable node in the DOM instead of behind a skeleton awaiting a live websocket.
 */
const TestProviders: FC<{ client: QueryClient; options?: ProviderOptions; children: ReactNode }> = ({
    client,
    options,
    children,
}) => (
    <QueryClientProvider client={client}>
        <SessionInfoProvider userInfo={layoutUserInfo(options)}>
            <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
                <SpyModeProvider>
                    <YjsWebsocketProvider singleUserEditing={options?.singleUserEditing}>
                        <ModalsProvider>{children}</ModalsProvider>
                    </YjsWebsocketProvider>
                </SpyModeProvider>
            </MantineProvider>
        </SessionInfoProvider>
    </QueryClientProvider>
)

// One builder, so a server render and its hydration can never wrap the UI in different providers.
// A caller-supplied client lets a test prime a query before the first render.
const withTestProviders = (ui: ReactElement, options?: ProviderOptions) => (
    <TestProviders client={options?.queryClient ?? createTestQueryClient()} options={options}>
        {ui}
    </TestProviders>
)

export const renderWithProviders = (ui: ReactElement, options?: Parameters<typeof render>[1] & ProviderOptions) =>
    render(withTestProviders(ui, options), options)

// The HTML the server sends, for asserting what reaches the page before hydration.
export const renderToServerHtml = (ui: ReactElement, options?: ProviderOptions) =>
    renderToString(withTestProviders(ui, options))

// Hydrates the server HTML as the browser does; a mismatch lands in `recoverableErrors`.
export function hydrateServerHtml(ui: ReactElement, options?: ProviderOptions) {
    const tree = withTestProviders(ui, options)
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree)
    document.body.appendChild(container)

    const recoverableErrors: unknown[] = []
    const result = render(tree, {
        container,
        hydrate: true,
        onRecoverableError: (error: unknown) => recoverableErrors.push(error),
    })
    return { ...result, recoverableErrors }
}

// Spy mode is otherwise driven by the hidden pi symbol. It switches on in an effect, so the first
// render is not yet in spy mode: find spy-only elements, do not get them.
export function SpyMode({ children }: { children: ReactNode }) {
    const { isSpyMode, toggleSpyMode } = useSpyMode()
    useEffect(() => {
        if (!isSpyMode) toggleSpyMode()
    }, [isSpyMode, toggleSpyMode])
    return <>{children}</>
}

// Shows the org list that useSession() holds, for tests of the flows that change it.
export const SessionOrgSlugs: FC = () => {
    const result = useAppSession()
    const slugs = result.isLoaded ? Object.keys(result.session.orgs).sort().join(',') : 'loading'
    return <output aria-label="session orgs">{slugs}</output>
}

// Records the cached org list each time the app calls router.push, so a test can show that a flow
// reloaded the list before it navigated, not after.
export const recordOrgListAtPush = (client: QueryClient) => {
    const listsAtPush: string[][] = []
    const push = RouterMock.memoryRouter.push.bind(RouterMock.memoryRouter)
    vi.spyOn(RouterMock.memoryRouter, 'push').mockImplementation((...args) => {
        listsAtPush.push(
            client
                .getQueriesData<UserInfo>({ queryKey: CURRENT_USER_INFO_KEY })
                .flatMap(([, info]) => Object.keys(info?.orgs ?? {})),
        )
        return push(...args)
    })
    return listsAtPush
}

// The eyebrow above a page's h1 is a paragraph, and an absent one renders an empty reserved slot,
// so there is no role or text to find it by.
export const pageHeaderEyebrow = () => screen.getByTestId('page-header-eyebrow').textContent

// Through the header's text: a sortable header's accessible name carries the sort icon too.
export const tableHeader = (title: string) => {
    const header = screen.getByText(title).closest('th')
    if (!header) throw new Error(`no ${title} header`)
    return header
}

// mantine-datatable makes a sortable header a button.
export const isSortableHeader = (title: string) => tableHeader(title).getAttribute('role') === 'button'
