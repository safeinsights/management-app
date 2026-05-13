import { useEffect } from 'react'
import { describe, expect, it, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { useForm, type UseFormReturnType } from '@mantine/form'

import { CodeReviewFeedbackProviderShare } from '@/lib/realtime/code-review-feedback-provider-context'
import { type CodeReviewCriteriaDraft } from '@/hooks/use-code-review-evaluation-map'
import { CodeEvaluationSection } from './code-evaluation-section'

type FormShape = { criteria: CodeReviewCriteriaDraft }

const initialDraft: CodeReviewCriteriaDraft = {
    proposalAlignment: null,
    agreementCompliance: null,
    securityChecks: null,
    privacyProtection: null,
}

// Mount the form and section in a single React tree so setFieldValue actually
// re-renders the section. Production wires the form in CodeReviewClient (one
// tree); rendering useForm via renderHook produces a separate tree and the
// Clear button visibility (which keys off form.getValues()) would never update.
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
    it('Clear button is hidden until a criterion is selected, then resets it to null', async () => {
        const user = userEvent.setup()
        const refs = renderSection()

        expect(screen.queryByTestId('criteria-clear-proposalAlignment')).toBeNull()

        const yesRadios = screen.getAllByRole('radio', { name: /^Yes$/i })
        await user.click(yesRadios[0])
        expect(refs.form.getValues().criteria.proposalAlignment).toBe('yes')

        const clearBtn = await screen.findByTestId('criteria-clear-proposalAlignment')
        expect(clearBtn).toBeVisible()

        await user.click(clearBtn)
        expect(refs.form.getValues().criteria.proposalAlignment).toBeNull()
        expect(screen.queryByTestId('criteria-clear-proposalAlignment')).toBeNull()
    })

    it('Clear is independent per criterion row', async () => {
        const user = userEvent.setup()
        const refs = renderSection()

        const yesRadios = screen.getAllByRole('radio', { name: /^Yes$/i })
        const noRadios = screen.getAllByRole('radio', { name: /^No$/i })

        await user.click(yesRadios[0])
        await user.click(noRadios[1])
        expect(refs.form.getValues().criteria.proposalAlignment).toBe('yes')
        expect(refs.form.getValues().criteria.agreementCompliance).toBe('no')

        await user.click(await screen.findByTestId('criteria-clear-agreementCompliance'))
        expect(refs.form.getValues().criteria.proposalAlignment).toBe('yes')
        expect(refs.form.getValues().criteria.agreementCompliance).toBeNull()
    })
})
