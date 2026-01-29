import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StudyOrgSelector } from './study-org-selector'
import { useForm } from '@mantine/form'
import { MantineProvider } from '@mantine/core'
import { theme } from '@/theme'
import { FC, ReactNode } from 'react'
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUser } from '@clerk/nextjs'
import type { Mock } from 'vitest'
import type { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/step1-schema'

// Mock the dependencies
vi.mock('@clerk/nextjs', () => ({
    useUser: vi.fn(),
}))

vi.mock('../openstax-feature-flag', () => ({
    useOpenStaxFeatureFlag: vi.fn(() => (globalThis as { __mockOpenStaxEnabled?: boolean }).__mockOpenStaxEnabled),
}))

vi.mock('@/server/actions/org.actions', () => ({
    getStudyCapableEnclaveOrgsAction: vi.fn(() =>
        Promise.resolve([
            { slug: 'test-org', name: 'Test Organization' },
            { slug: 'another-org', name: 'Another Organization' },
        ]),
    ),
}))

const mockUseUser = useUser as Mock

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
})

const TestWrapper: FC<{ children: ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>
        <MantineProvider theme={theme}>{children}</MantineProvider>
    </QueryClientProvider>
)

interface FormWrapperProps {
    orgSlug?: string
}

const FormWrapper: FC<FormWrapperProps> = ({ orgSlug = '' }) => {
    const form = useForm<StudyProposalFormValues>({
        initialValues: {
            orgSlug,
            language: null,
            title: '',
            piName: '',
            description: '',
            descriptionDocument: null,
            irbDocument: null,
            agreementDocument: null,
            mainCodeFile: null,
            additionalCodeFiles: [],
            stepIndex: 0,
            createdStudyId: null,
            ideMainFile: '',
            ideFiles: [],
        },
    })

    return (
        <TestWrapper>
            <StudyOrgSelector form={form} />
        </TestWrapper>
    )
}

describe('StudyOrgSelector', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        queryClient.clear()
        ;(globalThis as { __mockOpenStaxEnabled?: boolean }).__mockOpenStaxEnabled = false
        mockUseUser.mockReturnValue({
            user: { id: 'user-1', publicMetadata: {}, unsafeMetadata: {} },
            isLoaded: true,
        })
    })

    describe('Legacy flow (feature flag disabled)', () => {
        it('renders step indicator as "Step 1 of 5"', async () => {
            render(<FormWrapper />)

            await waitFor(() => {
                expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument()
            })
        })

        it('renders title as "Select data organization"', async () => {
            render(<FormWrapper />)

            await waitFor(() => {
                expect(screen.getByRole('heading', { name: 'Select data organization' })).toBeInTheDocument()
            })
        })
    })

    describe('OpenStax flow (feature flag enabled)', () => {
        beforeEach(() => {
            ;(globalThis as { __mockOpenStaxEnabled?: boolean }).__mockOpenStaxEnabled = true
        })

        it('renders step indicator as "Step 1" when no org is selected', async () => {
            render(<FormWrapper orgSlug="" />)

            await waitFor(() => {
                expect(screen.getByText(/^step 1$/i)).toBeInTheDocument()
            })
        })

        it('renders step indicator as "Step 1A" when org is selected', async () => {
            render(<FormWrapper orgSlug="test-org" />)

            await waitFor(() => {
                expect(screen.getByText(/step 1a/i)).toBeInTheDocument()
            })
        })

        it('renders title as "Data organization"', async () => {
            render(<FormWrapper />)

            await waitFor(() => {
                expect(screen.getByRole('heading', { name: 'Data organization' })).toBeInTheDocument()
            })
        })
    })
})
