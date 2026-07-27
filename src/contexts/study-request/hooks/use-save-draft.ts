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
            // title is omitted: it's owned by the Step 2 editor's autosave mirror and by
            // submission. Sending Step 1's stale copy would overwrite the mirrored title.
            const draftInfo = {
                piName: formValues.piName || undefined,
                language: formValues.language || undefined,
            }

            let result
            if (studyId) {
                result = actionResult(
                    await onUpdateDraftStudyAction({
                        studyId,
                        studyInfo: draftInfo,
                    }),
                )
            } else {
                if (!formValues.orgSlug) {
                    throw new Error('Data Partner is required to create a study')
                }
                result = actionResult(
                    await onSaveDraftStudyAction({
                        orgSlug: formValues.orgSlug,
                        studyInfo: draftInfo,
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
