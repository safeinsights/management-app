import { useEffect } from 'react'
import { describe, expect, it, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { useForm, type UseFormReturnType } from '@mantine/form'

import { CodeReviewFeedbackProviderShare } from '@/lib/realtime/code-review-feedback-provider-context'
import { type CodeReviewCriteriaDraft } from '@/hooks/use-code-review-evaluation-map'
import { CodeEvaluationSection } from './code-evaluation-section'
import { CODE_REVIEW_CRITERIA } from './code-review-criteria'

type FormShape = { criteria: CodeReviewCriteriaDraft }

const initialDraft: CodeReviewCriteriaDraft = {
    proposalAlignment: null,
    agreementCompliance: null,
    securityChecks: null,
    privacyProtection: null,
}

const renderSection = () => {
    const handle: { form: UseFormReturnType<FormShape> | null } = { form: null }
    const Harness = () => {
        const form = useForm<FormShape>({ initialValues: { criteria: initialDraft } })
        useEffect(() => {
            handle.form = form
        }, [form])
        return (
            <CodeReviewFeedbackProviderShare>
                <CodeEvaluationSection form={form} enabled />
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
    it('renders the heading, intro, attention alert, and the four criteria rows', () => {
        renderSection()

        expect(screen.getByText('Code evaluation')).toBeInTheDocument()
        expect(screen.getByText(/Use this checklist to guide your review/)).toBeInTheDocument()
        expect(screen.getByTestId('code-evaluation-attention')).toHaveTextContent(
            /This checklist is provided as guidance/,
        )
        expect(screen.getByText('Evaluation criteria')).toBeInTheDocument()

        for (const descriptor of CODE_REVIEW_CRITERIA) {
            expect(screen.getByTestId(`criteria-row-${descriptor.key}`)).toHaveTextContent(descriptor.label)
        }
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
})
