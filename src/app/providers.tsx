'use client'

import '../../sentry.client.config'
import { MantineProvider } from '@mantine/core'
import { theme } from '@/theme'
import { ModalsProvider } from '@mantine/modals'
import { useEffect } from 'react'
// Since QueryClientProvider relies on useContext under the hood, we have to put 'use client' on top
// reference: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
//
import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FC, ReactNode } from 'react'
import SentryUserProvider from '@/components/sentry-user-provider'
import { ClerkProvider } from '@clerk/nextjs'
import { ErrorAlert } from '@/components/errors'

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

    const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

    useEffect(() => {
        window.isReactHydrated = true
    }, [])

    if (!clerkPublishableKey) {
        return <ErrorAlert error={'missing clerk key'} />
    }

    return (
        <ClerkProvider
            publishableKey={clerkPublishableKey}
            localization={{
                organizationSwitcher: {
                    personalWorkspace: 'Researcher Account',
                },
            }}
        >
            <QueryClientProvider client={queryClient}>
                <SentryUserProvider />
                <MantineProvider theme={theme}>
                    <ModalsProvider>{children}</ModalsProvider>
                </MantineProvider>
            </QueryClientProvider>
        </ClerkProvider>
    )
}
