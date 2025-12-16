import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@/common'
import { notifications } from '@mantine/notifications'
import { Routes } from '@/lib/routes'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { onSubmitDraftStudyAction, onDeleteStudyAction, submitStudyFromIDEAction } from '@/server/actions/study-request'
import { isActionError, errorToString } from '@/lib/errors'
import { actionResult } from '@/lib/utils'
import logger from '@/lib/logger'
import {
    useStudyRequestStore,
    useCodeFiles,
    useCodeSource,
    getCodeFilesForUpload,
    hasNewCodeFiles,
} from '@/stores/study-request.store'

interface UseSubmitStudyOptions {
    studyId: string
}

export function useSubmitStudy({ studyId }: UseSubmitStudyOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const store = useStudyRequestStore()
    const codeFiles = useCodeFiles()
    const codeSource = useCodeSource()

    const getFileName = (f: { type: 'memory'; file: File } | { type: 'server'; name: string }): string =>
        f.type === 'memory' ? f.file.name : f.name

    const mainFileName = codeFiles.mainFile ? getFileName(codeFiles.mainFile) : null
    const additionalFileNames = codeFiles.additionalFiles.map(getFileName)
    const allFileNames = mainFileName ? [mainFileName, ...additionalFileNames] : additionalFileNames

    const mutation = useMutation({
        mutationFn: async () => {
            if (!mainFileName) {
                throw new Error('Missing required code file. Please upload the main code file.')
            }

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

            const { studyId: submittedStudyId, urlForCodeUpload } = actionResult(
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
                        const result = await onDeleteStudyAction({ studyId: submittedStudyId })
                        if (isActionError(result)) {
                            logger.error(
                                `Failed to remove temp study details after upload failure: ${errorToString(result.error)}`,
                            )
                        }
                        throw err
                    }
                }
            }

            return { studyId: submittedStudyId }
        },
        onSuccess() {
            store.reset()

            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })

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
                title: 'Failed to submit study',
                message: `${errorToString(error)}\nPlease contact support.`,
            })
        },
    })

    return {
        submitStudy: mutation.mutate,
        isSubmitting: mutation.isPending,
        mainFileName,
        additionalFileNames,
        canSubmit: !!mainFileName,
    }
}
