import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FC } from 'react'
import { userEvent, type Mock } from '@/tests/unit.helpers'
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

const LANGUAGE_ERROR = 'Programming language is required'
// Its own slug, so the languages query misses the cache `TestingProviders` shares across this
// file (staleTime 60s) and actually reads the two-language response below. Reusing 'test-org'
// replays the single-language result, which the section auto-selects, leaving no error state.
const MULTI_LANGUAGE_ORG = 'multi-language-org'

// Multi-language org, so the section renders a real choice instead of auto-selecting the only
// option, plus a way to put the group into its error state without reaching into the form.
const FlaggableFormWrapper: FC = () => {
    const form = useTestStudyProposalForm({ orgSlug: MULTI_LANGUAGE_ORG })

    return (
        <TestingProviders>
            <ProgrammingLanguageSection form={form} />
            <button type="button" onClick={() => form.setFieldError('language', LANGUAGE_ERROR)}>
                flag the language
            </button>
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

    // Radio.Group's context does not carry `error` to its children, so the message turned red
    // while both circles stayed grey and the invalid options were unmarked (OTTER-647).
    it('marks the language circles invalid, not just the message', async () => {
        ;(getLanguagesForOrgAction as Mock).mockResolvedValue({
            orgName: 'Test Organization',
            languages: [
                { value: 'R', label: 'R', starterCodeUrls: [], commandLines: {} },
                { value: 'PYTHON', label: 'Python', starterCodeUrls: [], commandLines: {} },
            ],
        })
        const user = userEvent.setup()
        render(<FlaggableFormWrapper />)

        const rOption = await screen.findByRole('radio', { name: 'R' })
        expect(rOption).not.toHaveAttribute('data-error')

        await user.click(screen.getByRole('button', { name: 'flag the language' }))

        expect(await screen.findByText(LANGUAGE_ERROR)).toBeInTheDocument()
        expect(rOption).toHaveAttribute('data-error', 'true')
        expect(screen.getByRole('radio', { name: 'Python' })).toHaveAttribute('data-error', 'true')
    })
})
