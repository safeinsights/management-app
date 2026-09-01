import { useCallback } from 'react'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@/common'
import { actionResult } from '@/lib/utils'
import { errorToString } from '@/lib/errors'
import { onSaveDraftStudyAction, onUpdateDraftStudyAction } from '@/server/actions/study-request'
import type { StudyProposalFormValues, MutationOptions } from '../study-request-types'

export interface UseSaveDraftOptions {
    studyId: string | null
    submittingOrgSlug: string
    onStudyCreated?: (studyId: string) => void
}

export interface UseSaveDraftReturn {
    saveDraft: (formValues: StudyProposalFormValues, options?: MutationOptions) => void
    isSaving: boolean
}

export function useSaveDraft({ studyId, submittingOrgSlug, onStudyCreated }: UseSaveDraftOptions): UseSaveDraftReturn {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async (formValues: StudyProposalFormValues) => {
            // OTTER-690: Step 1 is the single writer of `study.title` on a DRAFT. The one place it
            // is trimmed; validation measures raw length so it agrees with the character counter.
            const title = formValues.title?.trim() || undefined
            const draftInfo = {
                piName: formValues.piName || undefined,
                language: formValues.language || undefined,
            }

            let result
            if (studyId) {
                // `undefined` rather than `null`, so an accidental blank save never clears a
                // stored title.
                result = actionResult(
                    await onUpdateDraftStudyAction({
                        studyId,
                        studyInfo: { ...draftInfo, title },
                    }),
                )
            } else {
                if (!formValues.orgSlug) {
                    throw new Error('Data Partner is required to create a study')
                }
                // Creation cannot omit the title: the action rejects a blank one. Unreachable
                // behind the Save & continue gate.
                if (!title) {
                    throw new Error('Study title is required to create a study')
                }
                result = actionResult(
                    await onSaveDraftStudyAction({
                        orgSlug: formValues.orgSlug,
                        studyInfo: { ...draftInfo, title },
                        submittingOrgSlug,
                    }),
                )
            }

            return { studyId: result.studyId }
        },
        onSuccess({ studyId: newStudyId }) {
            onStudyCreated?.(newStudyId)
            queryClient.invalidateQueries({ queryKey: ['draft-study', newStudyId] })
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-orgs'] })
        },
        onError: (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to save draft',
                message: `${errorToString(error)}\nPlease contact support.`,
            })
        },
    })

    const saveDraft = useCallback(
        (formValues: StudyProposalFormValues, options?: MutationOptions) => {
            mutation.mutate(formValues, {
                onSuccess: options?.onSuccess,
                onError: options?.onError,
            })
        },
        [mutation],
    )

    return {
        saveDraft,
        isSaving: mutation.isPending,
    }
}
