import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StudyProposalForm } from './proposal-form'
import { FC } from 'react'
import { TestingProviders, useTestStudyProposalForm } from '@/tests/providers'
import { mockOpenStaxFeatureFlagState } from '@/tests/unit.helpers'

vi.mock('@/components/openstax-feature-flag', () => ({
    OpenStaxFeatureFlag: ({
        defaultContent,
        optInContent,
    }: {
        defaultContent: React.ReactNode
        optInContent: React.ReactNode
    }) => (globalThis.__mockOpenStaxEnabled ? optInContent : defaultContent),
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

const FormWrapper: FC = () => {
    const form = useTestStudyProposalForm()

    return (
        <TestingProviders>
            <StudyProposalForm studyProposalForm={form} />
        </TestingProviders>
    )
}

describe('StudyProposalForm', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockOpenStaxFeatureFlagState(false)
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
            mockOpenStaxFeatureFlagState(true)
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
