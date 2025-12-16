'use client'

import { useMutation, useQueryClient } from '@/common'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { errorToString } from '@/lib/errors'
import { getLabSlug } from '@/lib/org'
import { actionResult } from '@/lib/utils'
import { notifications } from '@mantine/notifications'
import { onSaveDraftStudyAction, onUpdateDraftStudyAction } from '@/server/actions/study-request'
import { useStudyRequestStore } from '@/stores/study-request.store'
import type { Language } from '@/database/types'

export interface DraftFormValues {
    title?: string
    piName?: string
    language?: Language | null
    orgSlug?: string
    descriptionDocument?: File | null
    irbDocument?: File | null
    agreementDocument?: File | null
}

function formValuesToDraftInfo(formValues: DraftFormValues) {
    return {
        title: formValues.title || undefined,
        piName: formValues.piName || undefined,
        language: formValues.language || undefined,
        descriptionDocPath: formValues.descriptionDocument?.name,
        agreementDocPath: formValues.agreementDocument?.name,
        irbDocPath: formValues.irbDocument?.name,
    }
}

export function useSaveDraft() {
    const queryClient = useQueryClient()
    const store = useStudyRequestStore()

    const mutation = useMutation({
        mutationFn: async (formValues: DraftFormValues) => {
            const { studyId, submittingOrgSlug } = store
            const draftInfo = formValuesToDraftInfo(formValues)
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
                result = actionResult(
                    await onSaveDraftStudyAction({
                        orgSlug: formValues.orgSlug || '',
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
        onSuccess({ studyId }) {
            store.setStudyId(studyId)
            queryClient.invalidateQueries({ queryKey: ['draft-study', studyId] })
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

    return {
        saveDraft: mutation.mutate,
        saveDraftAsync: mutation.mutateAsync,
        isSaving: mutation.isPending,
    }
}
