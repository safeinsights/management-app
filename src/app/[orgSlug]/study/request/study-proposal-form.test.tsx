import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StudyProposalForm } from './proposal-form'
import { useForm } from '@mantine/form'
import { MantineProvider } from '@mantine/core'
import { theme } from '@/theme'
import { FC, ReactNode } from 'react'
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { StudyProposalFormValues } from './step1-schema'

// Mock the dependencies
vi.mock('@/components/openstax-feature-flag', () => ({
    OpenStaxFeatureFlag: vi.fn(({ defaultContent, optInContent }) => {
        // This will be controlled by mockOpenStaxEnabled
        const showOptIn = (globalThis as { __mockOpenStaxEnabled?: boolean }).__mockOpenStaxEnabled
        return showOptIn ? optInContent : defaultContent
    }),
    useOpenStaxFeatureFlag: vi.fn(() => (globalThis as { __mockOpenStaxEnabled?: boolean }).__mockOpenStaxEnabled),
}))

vi.mock('@/components/study/study-org-selector', () => ({
    StudyOrgSelector: () => <div data-testid="study-org-selector">Study Org Selector</div>,
}))

vi.mock('@/components/study/programming-language-section', () => ({
    ProgrammingLanguageSection: () => (
        <div data-testid="programming-language-section">Programming Language Section</div>
    ),
}))

vi.mock('./study-details', () => ({
    RequestStudyDetails: () => <div data-testid="study-details">Study Details</div>,
}))

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
})

const TestWrapper: FC<{ children: ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>
        <MantineProvider theme={theme}>{children}</MantineProvider>
    </QueryClientProvider>
)

const FormWrapper: FC = () => {
    const form = useForm<StudyProposalFormValues>({
        initialValues: {
            orgSlug: '',
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
            <StudyProposalForm studyProposalForm={form} />
        </TestWrapper>
    )
}

describe('StudyProposalForm', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        ;(globalThis as { __mockOpenStaxEnabled?: boolean }).__mockOpenStaxEnabled = false
    })

    describe('Legacy flow (feature flag disabled)', () => {
        it('renders StudyOrgSelector', () => {
            render(<FormWrapper />)
            expect(screen.getByTestId('study-org-selector')).toBeInTheDocument()
        })

        it('renders RequestStudyDetails', () => {
            render(<FormWrapper />)
            expect(screen.getByTestId('study-details')).toBeInTheDocument()
        })

        it('renders ProgrammingLanguageSection', () => {
            render(<FormWrapper />)
            expect(screen.getByTestId('programming-language-section')).toBeInTheDocument()
        })
    })

    describe('OpenStax flow (feature flag enabled)', () => {
        beforeEach(() => {
            ;(globalThis as { __mockOpenStaxEnabled?: boolean }).__mockOpenStaxEnabled = true
        })

        it('renders StudyOrgSelector', () => {
            render(<FormWrapper />)
            expect(screen.getByTestId('study-org-selector')).toBeInTheDocument()
        })

        it('does not render RequestStudyDetails', () => {
            render(<FormWrapper />)
            expect(screen.queryByTestId('study-details')).not.toBeInTheDocument()
        })

        it('renders ProgrammingLanguageSection', () => {
            render(<FormWrapper />)
            expect(screen.getByTestId('programming-language-section')).toBeInTheDocument()
        })
    })
})
