import { useCallback, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { type UseFormReturnType } from '@mantine/form'
import { onUpdateDraftStudyAction, finalizeStudySubmissionAction } from '@/server/actions/study-request'
import { actionResult } from '@/lib/utils'
import { Routes } from '@/lib/routes'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

interface UseSubmitProposalOptions {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    buildStudyInfo: (values: ProposalFormValues) => Record<string, unknown>
}

export function useSubmitProposal({ studyId, form, buildStudyInfo }: UseSubmitProposalOptions) {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const submitProposal = useCallback(async () => {
        const validation = form.validate()
        if (validation.hasErrors) return

        setIsSubmitting(true)
        try {
            actionResult(await onUpdateDraftStudyAction({ studyId, studyInfo: buildStudyInfo(form.getValues()) }))
            actionResult(await finalizeStudySubmissionAction({ studyId }))
            form.resetDirty()
            router.push(Routes.studySubmitted({ orgSlug, studyId }))
        } catch (error) {
            notifications.show({
                title: 'Failed to submit proposal',
                message: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
                color: 'red',
            })
            setIsSubmitting(false)
        }
    }, [studyId, form, buildStudyInfo, router, orgSlug])

    return { submitProposal, isSubmitting }
}
