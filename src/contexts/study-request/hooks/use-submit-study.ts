import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@/common'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { isActionError, errorToString } from '@/lib/errors'
import logger from '@/lib/logger'
import {
    onSubmitDraftStudyAction,
    onDeleteStudyJobAction,
    submitStudyFromIDEAction,
    finalizeStudySubmissionAction,
} from '@/server/actions/study-request'
import { type CodeFileState, getCodeFilesForUpload, hasNewCodeFiles } from '@/contexts/shared/file-types'

export interface UseSubmitStudyOptions {
    studyId: string | null
    mainFileName: string | null
    additionalFileNames: string[]
    codeSource: 'upload' | 'ide'
    codeFiles: CodeFileState
    onSuccess?: () => void
}

export interface UseSubmitStudyReturn {
    submitStudy: () => void
    isSubmitting: boolean
}

export function useSubmitStudy({
    studyId,
    mainFileName,
    additionalFileNames,
    codeSource,
    codeFiles,
    onSuccess,
}: UseSubmitStudyOptions): UseSubmitStudyReturn {
    const router = useRouter()
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async () => {
            if (!studyId) {
                throw new Error('Study ID is required to submit')
            }
            if (!mainFileName) {
                throw new Error('Missing required code file. Please upload the main code file.')
            }

            const allFileNames = [mainFileName, ...additionalFileNames]

            if (codeSource === 'ide') {
                const result = await submitStudyFromIDEAction({
                    studyId,
                    mainFileName,
                    fileNames: allFileNames,
                })
                if ('error' in result) {
                    throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
                }
                return { studyId }
            }

            const {
                studyId: submittedStudyId,
                studyJobId,
                urlForCodeUpload,
            } = actionResult(
                await onSubmitDraftStudyAction({
                    studyId,
                    mainCodeFileName: mainFileName,
                    codeFileNames: additionalFileNames,
                }),
            )

            if (hasNewCodeFiles(codeFiles)) {
                const { main, additional } = getCodeFilesForUpload(codeFiles)
                const filesToUpload: FileUpload[] = []

                if (main) {
                    filesToUpload.push([main, urlForCodeUpload])
                }
                additional.forEach((f) => {
                    filesToUpload.push([f, urlForCodeUpload])
                })

                if (filesToUpload.length > 0) {
                    try {
                        await uploadFiles(filesToUpload)
                    } catch (err: unknown) {
                        // Delete only the study job, not the entire study
                        // The study should remain as a DRAFT so user can try again
                        const result = await onDeleteStudyJobAction({ studyJobId })
                        if (isActionError(result)) {
                            logger.error(
                                `Failed to remove study job after upload failure: ${errorToString(result.error)}`,
                            )
                        }
                        throw err
                    }
                }
            }

            // Finalize submission - change status to PENDING-REVIEW only after files are successfully
            // uploaded and the study is submitted. This prevents the page from redirecting before files are uploaded, which could
            // cause errors if upload fails.
            const finalizeResult = await finalizeStudySubmissionAction({ studyId: submittedStudyId })
            if (isActionError(finalizeResult)) {
                throw new Error(errorToString(finalizeResult.error))
            }

            return { studyId: submittedStudyId }
        },
        onSuccess() {
            onSuccess?.()
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['orgs-with-stats'] })

            notifications.show({
                title: 'Study Proposal Submitted',
                message:
                    'Your proposal has been successfully submitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })

            router.push(Routes.dashboard)
        },
        onError: (error) => {
            notifications.show({
                color: 'red',
                title: 'Unable to Submit Study',
                message: errorToString(error.message),
            })
        },
    })

    const submitStudy = useCallback(() => {
        mutation.mutate()
    }, [mutation])

    return {
        submitStudy,
        isSubmitting: mutation.isPending,
    }
}
