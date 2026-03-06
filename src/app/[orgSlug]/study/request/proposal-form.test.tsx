import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StudyProposalForm } from './proposal-form'
import { FC } from 'react'
import { TestingProviders, useTestStudyProposalForm } from '@/tests/providers'

vi.mock('@/components/study/study-org-selector', () => ({
    StudyOrgSelector: () => <div data-testid="study-org-selector">Study Org Selector</div>,
}))

vi.mock('@/components/study/programming-language-section', () => ({
    ProgrammingLanguageSection: () => (
        <div data-testid="programming-language-section">Programming Language Section</div>
    ),
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
    it('renders StudyOrgSelector', () => {
        render(<FormWrapper />)
        expect(screen.getByTestId('study-org-selector')).toBeInTheDocument()
    })

    it('renders ProgrammingLanguageSection', () => {
        render(<FormWrapper />)
        expect(screen.getByTestId('programming-language-section')).toBeInTheDocument()
    })
})
