import { useMutation, useQuery, useQueryClient } from '@/common'
import { notifications } from '@mantine/notifications'
import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { errorToString } from '@/lib/errors'
import { useWorkspaceLauncher } from './use-workspace-launcher'
import { useWorkspaceFiles, type WorkspaceFileInfo } from './use-workspace-files'
import { uploadWorkspaceFileAction, deleteWorkspaceFileAction } from '@/server/actions/workspace-files.actions'
import { submitStudyCodeAction } from '@/server/actions/study-request'
import { getLastSubmissionInfoAction } from '@/server/actions/workspaces.actions'

interface UseIDEFilesOptions {
    studyId: string
    onSubmitSuccess?: () => void
}

type LastSubmissionInfo = {
    submittedAt: string
    mainFileName: string | null
    fileNames: string[]
}

function areFilesUnchanged(
    workspaceFiles: WorkspaceFileInfo[],
    mainFile: string,
    lastSubmission: LastSubmissionInfo | null | undefined,
): boolean {
    if (!lastSubmission) return false

    const currentNames = workspaceFiles.map((f) => f.name).sort()
    const previousNames = [...lastSubmission.fileNames].sort()
    if (currentNames.length !== previousNames.length) return false
    if (currentNames.some((name, i) => name !== previousNames[i])) return false

    if (mainFile !== lastSubmission.mainFileName) return false

    const submittedAt = new Date(lastSubmission.submittedAt).getTime()
    return workspaceFiles.every((f) => new Date(f.mtime).getTime() <= submittedAt)
}

export function useIDEFiles({ studyId, onSubmitSuccess }: UseIDEFilesOptions) {
    const queryClient = useQueryClient()
    const router = useRouter()

    const [mainFileOverride, setMainFileOverride] = useState<string | null>(null)

    const {
        launchWorkspace,
        isLaunching: isLaunchingWorkspace,
        isCreatingWorkspace,
        error: launchError,
    } = useWorkspaceLauncher({ studyId })

    const workspace = useWorkspaceFiles({ studyId, enabled: true, refetchInterval: 5000 })

    const { data: lastSubmission } = useQuery({
        queryKey: ['last-submission', studyId],
        queryFn: async () => {
            const result = await getLastSubmissionInfoAction({ studyId })
            if (result && 'error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
            return result
        },
    })

    const fileNames = useMemo(() => workspace.files.map((f) => f.name), [workspace.files])
    const mainFile = useMemo(() => {
        if (mainFileOverride && fileNames.includes(mainFileOverride)) return mainFileOverride
        if (workspace.suggestedMain && fileNames.includes(workspace.suggestedMain)) return workspace.suggestedMain
        return fileNames[0] ?? ''
    }, [mainFileOverride, workspace.suggestedMain, fileNames])

    const filesUnchanged = useMemo(
        () => areFilesUnchanged(workspace.files, mainFile, lastSubmission),
        [workspace.files, mainFile, lastSubmission],
    )

    const isLaunching = isLaunchingWorkspace || isCreatingWorkspace
    const showEmptyState = fileNames.length === 0 && !workspace.isLoading
    const canSubmit = mainFile !== '' && fileNames.length > 0 && !filesUnchanged

    const submitDisabledReason = filesUnchanged ? 'Code is unchanged, edit or add files to submit' : null

    const setMainFile = useCallback((fileName: string) => {
        setMainFileOverride(fileName)
    }, [])

    const invalidateFiles = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['workspace-files', studyId] })
    }, [queryClient, studyId])

    const deleteMutation = useMutation({
        mutationFn: async (fileName: string) => {
            const result = await deleteWorkspaceFileAction({ studyId, fileName })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
        },
        onSuccess: () => invalidateFiles(),
        onError: (error) => {
            notifications.show({ color: 'red', title: 'Failed to delete file', message: errorToString(error) })
        },
    })

    const removeFile = useCallback(
        (fileName: string) => {
            setMainFileOverride((prev) => (prev === fileName ? null : prev))
            deleteMutation.mutate(fileName)
        },
        [deleteMutation],
    )

    const uploadMutation = useMutation({
        mutationFn: async (filesToUpload: File[]) => {
            for (const file of filesToUpload) {
                const result = await uploadWorkspaceFileAction({ studyId, file })
                if ('error' in result) {
                    throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
                }
            }
        },
        onSuccess: () => invalidateFiles(),
        onError: (error) => {
            notifications.show({ color: 'red', title: 'Failed to upload files', message: errorToString(error) })
        },
    })

    const uploadFiles = useCallback(
        (filesToUpload: File[]) => {
            uploadMutation.mutate(filesToUpload)
        },
        [uploadMutation],
    )

    const submitMutation = useMutation({
        mutationFn: async () => {
            const result = await submitStudyCodeAction({
                studyId,
                mainFileName: mainFile,
                fileNames,
            })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
            return result
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-orgs'] })
            queryClient.invalidateQueries({ queryKey: ['workspace-files', studyId] })
            queryClient.invalidateQueries({ queryKey: ['last-submission', studyId] })

            notifications.show({
                title: 'Study Code Submitted',
                message:
                    'Your code has been successfully submitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })

            if (onSubmitSuccess) {
                onSubmitSuccess()
            } else {
                router.push(Routes.dashboard)
            }
        },
        onError: (error) => {
            notifications.show({
                color: 'red',
                title: 'Unable to Submit Study',
                message: errorToString(error.message),
            })
        },
    })

    const submitDirectly = useCallback(() => {
        if (!canSubmit) {
            notifications.show({
                color: 'red',
                title: 'Cannot proceed',
                message: 'Please add files and select a main file first.',
            })
            return
        }
        submitMutation.mutate()
    }, [canSubmit, submitMutation])

    return {
        launchWorkspace,
        isLaunching,
        launchError,

        isLoadingFiles: workspace.isLoading,
        showEmptyState,
        lastModified: workspace.lastModified,

        files: fileNames,
        mainFile,
        setMainFile,
        removeFile,
        uploadFiles,
        isUploading: uploadMutation.isPending,
        isDeleting: deleteMutation.isPending,

        canSubmit,
        submitDisabledReason,
        submitDirectly,
        isDirectSubmitting: submitMutation.isPending,
    }
}
