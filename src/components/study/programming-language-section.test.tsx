import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FC } from 'react'
import { ProgrammingLanguageSection } from './programming-language-section'
import { getLanguagesForOrgAction } from '@/server/actions/org.actions'
import { TestingProviders, useTestStudyProposalForm } from '@/tests/providers'

vi.mock('@/server/actions/org.actions', () => ({
    getLanguagesForOrgAction: vi.fn(() =>
        Promise.resolve({
            orgName: 'Test Organization',
            languages: [{ value: 'R', label: 'R', starterCodeUrls: [], commandLines: {} }],
        }),
    ),
}))

interface FormWrapperProps {
    orgSlug?: string
}

const FormWrapper: FC<FormWrapperProps> = ({ orgSlug = '' }) => {
    const form = useTestStudyProposalForm({ orgSlug })

    return (
        <TestingProviders>
            <ProgrammingLanguageSection form={form} />
        </TestingProviders>
    )
}

describe('ProgrammingLanguageSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    // OTTER: a stale session can leave orgSlug empty when a newly created org is
    // missing from the user's JWT. The languages query must stay disabled rather
    // than fire with '' and trigger an opaque "no result" throw server-side.
    it('does not query for languages when orgSlug is empty', async () => {
        render(<FormWrapper orgSlug="" />)

        // give react-query a tick to (not) fire
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(getLanguagesForOrgAction).not.toHaveBeenCalled()
    })

    it('queries for languages once an orgSlug is selected', async () => {
        render(<FormWrapper orgSlug="test-org" />)

        await waitFor(() => {
            expect(getLanguagesForOrgAction).toHaveBeenCalledWith({ orgSlug: 'test-org' })
        })
        expect(await screen.findByText('R')).toBeInTheDocument()
    })
})
