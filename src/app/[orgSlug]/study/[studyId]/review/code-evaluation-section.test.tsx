import { useEffect } from 'react'
import { within } from '@testing-library/react'
import { describe, expect, it, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { useForm, type UseFormReturnType } from '@mantine/form'

import { CodeReviewFeedbackProviderShare } from '@/lib/realtime/code-review-feedback-provider-context'
import { type CodeReviewCriteriaDraft } from '@/hooks/use-code-review-evaluation-map'
import { CodeEvaluationSection } from './code-evaluation-section'
import { codeReviewCriteria } from './code-review-criteria'

type FormShape = { criteria: CodeReviewCriteriaDraft }

const initialDraft: CodeReviewCriteriaDraft = {
    proposalAlignment: null,
    agreementCompliance: null,
    securityChecks: null,
    privacyProtection: null,
}

const renderSection = ({ isTestStudy = false }: { isTestStudy?: boolean } = {}) => {
    const handle: { form: UseFormReturnType<FormShape> | null } = { form: null }
    const Harness = () => {
        const form = useForm<FormShape>({ initialValues: { criteria: initialDraft } })
        useEffect(() => {
            handle.form = form
        }, [form])
        return (
            <CodeReviewFeedbackProviderShare>
                <CodeEvaluationSection form={form} enabled isTestStudy={isTestStudy} />
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

        for (const descriptor of codeReviewCriteria(false)) {
            expect(screen.getByTestId(`criteria-row-${descriptor.key}`)).toHaveTextContent(descriptor.label)
        }
    })

    it('explains the agreements criterion only when the study is a test study', async () => {
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

    // Radio.Group strands a hand-passed aria-label on its roleless outer wrapper, so assert the
    // accessible name rather than the attribute.
    it('names every criterion radiogroup after its visible criterion text', () => {
        renderSection()

        for (const descriptor of codeReviewCriteria(false)) {
            expect(screen.getByRole('radiogroup', { name: descriptor.label })).toBeInTheDocument()
        }
    })
})
