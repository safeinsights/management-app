import { useEffect } from 'react'
import { within } from '@testing-library/react'
import { describe, expect, it, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { useForm, type UseFormReturnType } from '@mantine/form'

import { CodeReviewFeedbackProviderShare } from '@/lib/realtime/code-review-feedback-provider-context'
import { type CodeReviewCriteriaDraft, type CodeReviewCriteriaKey } from '@/hooks/use-code-review-evaluation-map'
import { CodeEvaluationSection } from './code-evaluation-section'

const EXPECTED_LABELS: Record<CodeReviewCriteriaKey, string> = {
    proposalAlignment: 'Does code align with the approved proposal?',
    agreementCompliance: 'Does code align with the Study Agreement?',
    privacyProtection: 'Could the outputs expose any PII?',
}

type FormShape = { criteria: CodeReviewCriteriaDraft }

const initialDraft: CodeReviewCriteriaDraft = {
    proposalAlignment: null,
    agreementCompliance: null,
    privacyProtection: null,
}

const PROPOSAL_HREF = '/test-org/study/test-study/review/proposal'

const renderSection = ({
    validateOnBlur = false,
    isTestStudy = false,
}: { validateOnBlur?: boolean; isTestStudy?: boolean } = {}) => {
    const handle: { form: UseFormReturnType<FormShape> | null } = { form: null }
    const Harness = () => {
        const form = useForm<FormShape>({ initialValues: { criteria: initialDraft } })
        useEffect(() => {
            handle.form = form
        }, [form])
        return (
            <CodeReviewFeedbackProviderShare>
                <CodeEvaluationSection
                    form={form}
                    enabled
                    proposalHref={PROPOSAL_HREF}
                    isTestStudy={isTestStudy}
                    validateOnBlur={validateOnBlur}
                />
            </CodeReviewFeedbackProviderShare>
        )
    }
    renderWithProviders(<Harness />)
    return {
        get form() {
            if (!handle.form) throw new Error('Harness did not capture form')
            return handle.form
        },
    }
}

describe('CodeEvaluationSection', () => {
    it('renders the heading, attention alert, and the three criteria rows', () => {
        renderSection()

        expect(screen.getByText('Code evaluation')).toBeInTheDocument()
        expect(screen.getByTestId('code-evaluation-attention')).toHaveTextContent(/This checklist is for guidance only/)
        expect(screen.getByText('Evaluation criteria')).toBeInTheDocument()

        for (const [key, label] of Object.entries(EXPECTED_LABELS)) {
            expect(screen.getByTestId(`criteria-row-${key}`)).toHaveTextContent(label)
        }
    })

    it('links proposal to the review proposal page in a new tab', () => {
        renderSection()
        const link = screen.getByTestId('criteria-proposal-link')
        expect(link).toHaveAttribute('href', PROPOSAL_HREF)
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('data-underline', 'always')
        expect(link).toHaveTextContent('proposal')
        expect(link.querySelector('svg')).toBeInTheDocument()
    })

    it('explains the agreements criterion only when the study is a test study', () => {
        renderSection({ isTestStudy: true })

        const row = screen.getByTestId('criteria-row-agreementCompliance')
        expect(within(row).getByLabelText(/This is a test study/i)).toBeInTheDocument()
    })

    it('leaves the agreements criterion as plain text for an ordinary study', () => {
        renderSection()

        const row = screen.getByTestId('criteria-row-agreementCompliance')
        expect(within(row).queryByLabelText(/This is a test study/i)).toBeNull()
    })

    it('updates the form value when a radio is selected', async () => {
        const user = userEvent.setup()
        const refs = renderSection()

        const yesRadios = screen.getAllByRole('radio', { name: /^Yes$/i })
        await user.click(yesRadios[0])
        expect(refs.form.getValues().criteria.proposalAlignment).toBe('yes')

        const noRadios = screen.getAllByRole('radio', { name: /^No$/i })
        await user.click(noRadios[1])
        expect(refs.form.getValues().criteria.agreementCompliance).toBe('no')
    })

    it('wires every criterion radiogroup to its visible label', () => {
        renderSection()

        for (const key of Object.keys(EXPECTED_LABELS)) {
            const labelId = `criteria-${key}-label`
            const radioGroup = screen.getByRole('radiogroup', {
                name: (_name, el) => el.getAttribute('aria-labelledby') === labelId,
            })
            expect(radioGroup).toBeInTheDocument()
        }
    })
})
