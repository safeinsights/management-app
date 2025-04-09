'use client'

import { MantineProvider } from '@mantine/core'
import { theme } from '@/theme'
import { ModalsProvider } from '@mantine/modals'

// Since QueryClientProvider relies on useContext under the hood, we have to put 'use client' on top
// reference: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
//
import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FC, ReactNode } from 'react'

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // With SSR, we usually want to set some default staleTime
                // above 0 to avoid re-fetching immediately on the client
                staleTime: 60 * 1000,
                // Every 15 minutes - open to input on this
                refetchInterval: 15 * 1000 * 60,
            },
        },
    })
}

let browserQueryClient: QueryClient | undefined = undefined

type Props = {
    children: ReactNode
}

export function getQueryClient() {
    if (isServer) {
        // Server: always make a new query client
        return makeQueryClient()
    } else {
        // Browser: make a new query client if we don't already have one
        // This is very important, so we don't re-make a new client if React
        // suspends during the initial render. This may not be needed if we
        // have a suspense boundary BELOW the creation of the query client
        if (!browserQueryClient) browserQueryClient = makeQueryClient()
        return browserQueryClient
    }
}

export const Providers: FC<Props> = ({ children }) => {
    const queryClient = getQueryClient()

    return (
        <QueryClientProvider client={queryClient}>
            <MantineProvider theme={theme}>
                <ModalsProvider>{children}</ModalsProvider>
            </MantineProvider>
        </QueryClientProvider>
    )
}
