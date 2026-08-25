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
            // OTTER-690: Step 1 owns `study.title` on a DRAFT, so it is sent from here. The
            // Step 2 editor no longer renders or mirrors the title for drafts, which is what
            // makes this the single writer rather than a racing second one.
            //
            // This is the one place the title is trimmed; validation measures the raw length so it
            // agrees with the character counter.
            const title = formValues.title?.trim() || undefined
            const draftInfo = {
                piName: formValues.piName || undefined,
                language: formValues.language || undefined,
            }

            let result
            if (studyId) {
                // `undefined` rather than `null` on update: an accidental blank save must never
                // clear a stored title, and this action also serves the resubmit autosave, whose
                // title is owned elsewhere.
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
                // Creation cannot fall back to omitting the title: an untitled row is what the
                // /proposal and finalize guards exist to rescue, so `onSaveDraftStudyAction`
                // rejects a blank one. The Save & continue gate means this is unreachable here.
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
