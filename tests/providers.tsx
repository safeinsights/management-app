import { MantineProvider } from '@mantine/core'
import { theme } from '@/theme'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // With SSR, we usually want to set some default staleTime
            // above 0 to avoid refetching immediately on the client
            staleTime: 60 * 1000,
        },
    },
})

export const TestingProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <MantineProvider theme={theme}>
            <QueryClientProvider client={queryClient}>
                <ModalsProvider>{children}</ModalsProvider>
            </QueryClientProvider>
        </MantineProvider>
    )
}


export const TestingProvidersWrapper = {
    wrapper: TestingProviders,
}
