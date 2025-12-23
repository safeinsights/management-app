import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@/common'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { isActionError, errorToString } from '@/lib/errors'
import logger from '@/lib/logger'
import { addJobToStudyAction, onDeleteStudyJobAction, submitStudyFromIDEAction } from '@/server/actions/study-request'

export interface ResubmitUploadPayload {
    mainFileName: string
    mainFile: File
    additionalFiles: File[]
}

export interface ResubmitIDEPayload {
    mainFileName: string
    fileNames: string[]
}

export interface UseResubmitMutationOptions {
    studyId: string
    submittingOrgSlug: string
}

export interface UseResubmitMutationReturn {
    resubmitFromUpload: (payload: ResubmitUploadPayload) => void
    resubmitFromIDE: (payload: ResubmitIDEPayload) => void
    isPending: boolean
}

export function useResubmitMutation({
    studyId,
    submittingOrgSlug,
}: UseResubmitMutationOptions): UseResubmitMutationReturn {
    const router = useRouter()
    const queryClient = useQueryClient()

    const onSuccess = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
        queryClient.invalidateQueries({ queryKey: ['workspace-files', studyId] })

        notifications.show({
            title: 'Study Resubmitted',
            message:
                'Your study has been successfully resubmitted to the reviewing organization. Check your dashboard for status updates.',
            color: 'green',
        })

        router.push(Routes.studyView({ orgSlug: submittingOrgSlug, studyId }))
    }, [queryClient, studyId, submittingOrgSlug, router])

    const onError = useCallback((error: Error) => {
        notifications.show({
            color: 'red',
            title: 'Failed to resubmit study',
            message: `${errorToString(error)}\nPlease contact support.`,
        })
    }, [])

    const uploadMutation = useMutation({
        mutationFn: async (payload: ResubmitUploadPayload) => {
            const { urlForCodeUpload, studyJobId } = actionResult(
                await addJobToStudyAction({
                    studyId,
                    mainCodeFileName: payload.mainFileName,
                    codeFileNames: payload.additionalFiles.map((f) => f.name),
                }),
            )

            try {
                await uploadFiles([
                    [payload.mainFile, urlForCodeUpload],
                    ...payload.additionalFiles.map((f) => [f, urlForCodeUpload] as FileUpload),
                ])
            } catch (err: unknown) {
                const response = await onDeleteStudyJobAction({ studyJobId })
                if (isActionError(response)) {
                    logger.error(
                        `Failed to remove temp study job details after upload failure: ${errorToString(response.error)}`,
                    )
                }
                throw err
            }
        },
        onSuccess,
        onError,
    })

    const ideMutation = useMutation({
        mutationFn: async (payload: ResubmitIDEPayload) => {
            const result = await submitStudyFromIDEAction({
                studyId,
                mainFileName: payload.mainFileName,
                fileNames: payload.fileNames,
            })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
        },
        onSuccess,
        onError,
    })

    const resubmitFromUpload = useCallback(
        (payload: ResubmitUploadPayload) => {
            uploadMutation.mutate(payload)
        },
        [uploadMutation],
    )

    const resubmitFromIDE = useCallback(
        (payload: ResubmitIDEPayload) => {
            ideMutation.mutate(payload)
        },
        [ideMutation],
    )

    return {
        resubmitFromUpload,
        resubmitFromIDE,
        isPending: uploadMutation.isPending || ideMutation.isPending,
    }
}
