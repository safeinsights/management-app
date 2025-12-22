import { useCallback } from 'react'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@/common'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { actionResult } from '@/lib/utils'
import { errorToString } from '@/lib/errors'
import { getLabSlug } from '@/lib/org'
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
            const draftInfo = {
                title: formValues.title || undefined,
                piName: formValues.piName || undefined,
                language: formValues.language || undefined,
                descriptionDocPath: formValues.descriptionDocument?.name,
                agreementDocPath: formValues.agreementDocument?.name,
                irbDocPath: formValues.irbDocument?.name,
            }
            const filesToUpload: FileUpload[] = []

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
                    throw new Error('Data organization is required to create a study')
                }
                result = actionResult(
                    await onSaveDraftStudyAction({
                        orgSlug: formValues.orgSlug,
                        studyInfo: draftInfo,
                        submittingOrgSlug: getLabSlug(submittingOrgSlug),
                    }),
                )
            }

            if (formValues.irbDocument && result.urlForIrbUpload) {
                filesToUpload.push([formValues.irbDocument, result.urlForIrbUpload])
            }
            if (formValues.agreementDocument && result.urlForAgreementUpload) {
                filesToUpload.push([formValues.agreementDocument, result.urlForAgreementUpload])
            }
            if (formValues.descriptionDocument && result.urlForDescriptionUpload) {
                filesToUpload.push([formValues.descriptionDocument, result.urlForDescriptionUpload])
            }

            if (filesToUpload.length > 0) {
                await uploadFiles(filesToUpload)
            }

            return { studyId: result.studyId }
        },
        onSuccess({ studyId: newStudyId }) {
            onStudyCreated?.(newStudyId)
            queryClient.invalidateQueries({ queryKey: ['draft-study', newStudyId] })
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })
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
