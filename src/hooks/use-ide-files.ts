import { useMutation, useQuery, useQueryClient } from '@/common'
import { notifications } from '@mantine/notifications'
import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { reportMutationError } from '@/components/errors'
import { useWorkspaceLauncher } from './use-workspace-launcher'
import { useWorkspaceFiles, type WorkspaceFileInfo } from './use-workspace-files'
import {
    uploadWorkspaceFileAction,
    deleteWorkspaceFileAction,
    readWorkspaceFileAction,
} from '@/server/actions/workspace-files.actions'
import { submitStudyCodeAction } from '@/server/actions/study-request'
import { getLastSubmissionInfoAction, getStarterCodeInfoAction } from '@/server/actions/workspaces.actions'

interface UseIDEFilesOptions {
    studyId: string
    onSubmitSuccess?: () => void
}

type LastJobInfo = {
    createdAt: string
    mainFileName: string | null
    fileNames: string[]
}

function hasChangedSinceLastJob(
    workspaceFiles: WorkspaceFileInfo[],
    mainFile: string,
    lastJob: LastJobInfo | null | undefined,
): boolean {
    if (!lastJob) return false

    // Check if any file was modified after the job was created
    const jobCreatedAt = new Date(lastJob.createdAt).getTime()
    const filesModified = workspaceFiles.some((f) => new Date(f.mtime).getTime() > jobCreatedAt)
    if (filesModified) return true

    // File set / main file comparison only applies after a real submission (not a baseline job)
    if (lastJob.fileNames.length > 0) {
        if (lastJob.mainFileName && mainFile !== lastJob.mainFileName) return true

        const currentNames = workspaceFiles.map((f) => f.name).sort()
        const previousNames = [...lastJob.fileNames].sort()
        if (currentNames.length !== previousNames.length) return true
        if (currentNames.some((name, i) => name !== previousNames[i])) return true
    }

    return false
}

export function useIDEFiles({ studyId, onSubmitSuccess }: UseIDEFilesOptions) {
    const queryClient = useQueryClient()
    const router = useRouter()

    const [mainFileOverride, setMainFileOverride] = useState<string | null>(null)
    const [viewingFile, setViewingFile] = useState<{ name: string; contents: string } | null>(null)

    const onLaunchSuccess = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['workspace-files', studyId] })
        queryClient.invalidateQueries({ queryKey: ['last-job', studyId] })
    }, [queryClient, studyId])

    const {
        launchWorkspace,
        isLaunching: isLaunchingWorkspace,
        isCreatingWorkspace,
        error: launchError,
    } = useWorkspaceLauncher({ studyId, onSuccess: onLaunchSuccess })

    const workspace = useWorkspaceFiles({ studyId, enabled: true, refetchInterval: 15000 })

    const { data: lastJob } = useQuery({
        queryKey: ['last-job', studyId],
        queryFn: () => getLastSubmissionInfoAction({ studyId }),
    })

    const { data: starterCodeInfo } = useQuery({
        queryKey: ['starter-code-info', studyId],
        queryFn: () => getStarterCodeInfoAction({ studyId }),
    })

    const fileNames = useMemo(() => workspace.files.map((f) => f.name), [workspace.files])
    const mainFile = useMemo(() => {
        if (mainFileOverride && fileNames.includes(mainFileOverride)) return mainFileOverride
        return ''
    }, [mainFileOverride, fileNames])

    const filesChanged = useMemo(
        () => hasChangedSinceLastJob(workspace.files, mainFile, lastJob),
        [workspace.files, mainFile, lastJob],
    )

    const isLaunching = isLaunchingWorkspace || isCreatingWorkspace
    const showEmptyState = fileNames.length === 0 && !workspace.isLoading
    const canSubmit = mainFile !== '' && fileNames.length > 0 && filesChanged

    const submitDisabledReason =
        !filesChanged && fileNames.length > 0 ? 'Modify a file or upload new ones before submitting' : null

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
        onError: reportMutationError('Failed to delete file'),
    })

    const removeFile = useCallback(
        (fileName: string) => {
            setMainFileOverride((prev) => (prev === fileName ? null : prev))
            deleteMutation.mutate(fileName)
        },
        [deleteMutation],
    )

    const viewFile = useCallback(
        async (fileName: string) => {
            const result = await readWorkspaceFileAction({ studyId, fileName })
            if ('error' in result) {
                reportMutationError('Failed to read file')(result.error)
                return
            }
            setViewingFile({ name: result.fileName, contents: result.contents })
        },
        [studyId],
    )

    const closeFileViewer = useCallback(() => setViewingFile(null), [])

    const uploadMutation = useMutation({
        mutationFn: async (filesToUpload: File[]) => {
            for (const file of filesToUpload) {
                const result = await uploadWorkspaceFileAction({ studyId, file })
                if ('error' in result) {
                    throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
                }
            }
        },
        onSettled: () => {
            invalidateFiles()
            queryClient.invalidateQueries({ queryKey: ['last-job', studyId] })
        },
        onError: reportMutationError('Failed to upload files'),
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
            queryClient.invalidateQueries({ queryKey: ['last-job', studyId] })

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
        onError: reportMutationError('Unable to submit study'),
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
        fileDetails: workspace.files,
        jobCreatedAt: lastJob?.createdAt ?? null,
        mainFile,
        setMainFile,
        removeFile,
        viewFile,
        viewingFile,
        closeFileViewer,
        uploadFiles,
        isUploading: uploadMutation.isPending,
        isDeleting: deleteMutation.isPending,

        canSubmit,
        submitDisabledReason,
        submitDirectly,
        isDirectSubmitting: submitMutation.isPending,

        starterFiles: starterCodeInfo?.starterFiles ?? [],
    }
}
