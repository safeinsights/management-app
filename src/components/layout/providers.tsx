'use client'

import { cssVariablesResolver, theme } from '@/theme'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { useEffect, type FC, type ReactNode } from 'react'
// QueryClientProvider relies on useContext, hence 'use client':
// https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
import { ErrorBoundary } from '@/components/error-boundary'
import { SpyModeProvider } from '@/components/spy-mode-context'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
// eslint-disable-next-line no-restricted-imports
import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePostHogInit } from '@/hooks/use-posthog-init'

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // A staleTime above 0 avoids re-fetching immediately on the client under SSR.
                staleTime: 60 * 1000,
                refetchInterval: 15 * 1000 * 60,
            },
        },
    })
}
let browserQueryClient: QueryClient | undefined = undefined
type Props = {
    children: ReactNode
    singleUserEditing?: boolean
    posthogProjectToken?: string
}
export function getQueryClient() {
    if (isServer) {
        return makeQueryClient()
    } else {
        // Reused so React suspending during the initial render does not remake the client.
        if (!browserQueryClient) browserQueryClient = makeQueryClient()
        return browserQueryClient
    }
}

export const Providers: FC<Props> = ({ children, singleUserEditing = false, posthogProjectToken = '' }) => {
    const queryClient = getQueryClient()
    usePostHogInit(posthogProjectToken)

    useEffect(() => {
        window.isReactHydrated = true
    }, [])

    return (
        <QueryClientProvider client={queryClient}>
            <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
                <ModalsProvider>
                    <ErrorBoundary>
                        <SpyModeProvider>
                            <YjsWebsocketProvider singleUserEditing={singleUserEditing}>
                                {children}
                            </YjsWebsocketProvider>
                        </SpyModeProvider>
                    </ErrorBoundary>
                </ModalsProvider>
            </MantineProvider>
        </QueryClientProvider>
    )
}
