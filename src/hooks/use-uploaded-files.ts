import { useMutation, useQueryClient } from '@/common'
import { uploadFiles as uploadFilesToS3, type FileUpload } from '@/hooks/upload'
import { uploadFileStore } from '@/hooks/upload-file-store'
import { errorToString } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { addJobToStudyAction } from '@/lib/study-actions'
import { actionResult } from '@/lib/utils'
import { notifications } from '@mantine/notifications'
import { useRouter } from 'next/navigation'
import { useCallback, useSyncExternalStore } from 'react'

interface UseUploadedFilesOptions {
    studyId: string
    orgSlug: string
}

export function useUploadedFiles({ studyId, orgSlug }: UseUploadedFilesOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()

    const state = useSyncExternalStore(
        uploadFileStore.subscribe,
        () => uploadFileStore.get(studyId),
        () => undefined, // server snapshot
    )

    const files = state?.files ?? []
    const fileNames = files.map((f) => f.name)
    const mainFile = state?.mainFileName ?? ''
    const hasFiles = !!state

    const setMainFile = useCallback((fileName: string) => uploadFileStore.setMainFile(studyId, fileName), [studyId])

    const removeFile = useCallback((fileName: string) => uploadFileStore.removeFile(studyId, fileName), [studyId])

    const goBack = useCallback(() => {
        uploadFileStore.clear(studyId)
        router.push(Routes.studyUpload({ orgSlug, studyId }))
    }, [studyId, orgSlug, router])

    const { isPending: isSubmitting, mutate: submit } = useMutation({
        mutationFn: async () => {
            if (!mainFile || files.length === 0) {
                throw new Error('Main file or files not set')
            }

            const mainFileObj = files.find((f) => f.name === mainFile)
            if (!mainFileObj) {
                throw new Error('Main file not found in uploaded files')
            }

            const additionalFiles = files.filter((f) => f.name !== mainFile)

            const { urlForCodeUpload } = actionResult(
                await addJobToStudyAction({
                    studyId,
                    mainCodeFileName: mainFileObj.name,
                    codeFileNames: additionalFiles.map((f) => f.name),
                }),
            )

            const filesToUpload: FileUpload[] = [
                [mainFileObj, urlForCodeUpload],
                ...additionalFiles.map((f): FileUpload => [f, urlForCodeUpload]),
            ]
            await uploadFilesToS3(filesToUpload)
        },
        onSuccess: () => {
            uploadFileStore.clear(studyId)
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
        onError: (error: Error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to submit study',
                message: `${errorToString(error)}\nPlease contact support.`,
            })
        },
    })

    const canSubmit = hasFiles && mainFile && fileNames.length > 0

    return {
        fileNames,
        mainFile,
        hasFiles,
        canSubmit,
        isSubmitting,
        setMainFile,
        removeFile,
        submit,
        goBack,
    }
}
