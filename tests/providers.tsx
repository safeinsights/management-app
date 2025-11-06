import { MantineProvider } from '@mantine/core'
import { theme } from '@/theme'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@/common'
import { FC, ReactNode } from 'react'
import { ClerkProvider } from '@clerk/nextjs'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // With SSR, we usually want to set some default staleTime
            // above 0 to avoid re-fetching immediately on the client
            staleTime: 60 * 1000,
            retry: false,
        },
    },
})

export const TestingProviders: FC<{ children: ReactNode }> = ({ children }) => {
    return (
        <MantineProvider theme={theme}>
            <QueryClientProvider client={queryClient}>
                <ClerkProvider>
                    <ModalsProvider>{children}</ModalsProvider>
                </ClerkProvider>
            </QueryClientProvider>
        </MantineProvider>
    )
}

export const TestingProvidersWrapper = {
    wrapper: TestingProviders,
}
