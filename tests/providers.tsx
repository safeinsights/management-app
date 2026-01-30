import { MantineProvider } from '@mantine/core'
import { useForm } from '@mantine/form'
import { theme } from '@/theme'
import { ModalsProvider } from '@mantine/modals'
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FC, ReactNode } from 'react'
import { ClerkProvider } from '@clerk/nextjs'
import { initialFormValues, type StudyProposalFormValues } from '@/contexts/study-request'

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

// Hook to create a test form with default values
export const useTestStudyProposalForm = (overrides?: Partial<StudyProposalFormValues>) => {
    return useForm<StudyProposalFormValues>({
        initialValues: {
            ...initialFormValues,
            ...overrides,
        },
    })
}
