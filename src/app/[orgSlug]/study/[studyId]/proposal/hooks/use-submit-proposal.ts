import { useCallback, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { type UseFormReturnType } from '@mantine/form'
import { onUpdateDraftStudyAction, finalizeStudySubmissionAction } from '@/server/actions/study-request'
import { actionResult } from '@/lib/utils'
import { type ProposalFormValues } from '../schema'

interface UseSubmitProposalOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    buildStudyInfo: (values: ProposalFormValues) => Record<string, unknown>
}

export function useSubmitProposal({ studyId, form, buildStudyInfo }: UseSubmitProposalOptions) {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSubmitted, setIsSubmitted] = useState(false)

    const submitProposal = useCallback(async () => {
        const validation = form.validate()
        if (validation.hasErrors) return

        setIsSubmitting(true)
        try {
            actionResult(await onUpdateDraftStudyAction({ studyId, studyInfo: buildStudyInfo(form.getValues()) }))
            actionResult(await finalizeStudySubmissionAction({ studyId }))
            form.resetDirty()
            setIsSubmitted(true)
        } catch (error) {
            notifications.show({
                title: 'Failed to submit proposal',
                message: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
                color: 'red',
            })
        } finally {
            setIsSubmitting(false)
        }
    }, [studyId, form, buildStudyInfo])

    return { submitProposal, isSubmitting, isSubmitted }
}
