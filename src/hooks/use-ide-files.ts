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

    const jobCreatedAt = new Date(lastJob.createdAt).getTime()
    const filesModified = workspaceFiles.some((f) => new Date(f.mtime).getTime() > jobCreatedAt)
    if (filesModified) return true

    // An empty fileNames marks a baseline job rather than a real submission.
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
    const [viewingFile, setViewingFile] = useState<{ name: string; contents: ArrayBuffer } | null>(null)
    // OTTER-558: `filesChanged` cannot drive the resubmit footer's Cancel toggle, because it
    // compares mtimes and is already true on load.
    const [userEditedFiles, setUserEditedFiles] = useState(false)

    const onLaunchSuccess = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['workspace-files', studyId] })
        queryClient.invalidateQueries({ queryKey: ['last-job', studyId] })
    }, [queryClient, studyId])

    const {
        launchWorkspace,
        isLaunching: isLaunchingWorkspace,
        isCreatingWorkspace,
        error: launchError,
        status: launchStatus,
        lastUpdatedAt: launchLastUpdatedAt,
        buildLog: launchBuildLog,
        agentLog: launchAgentLog,
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
    const previousMainFile = lastJob?.mainFileName ?? null
    const mainFile = useMemo(() => {
        if (mainFileOverride && fileNames.includes(mainFileOverride)) return mainFileOverride
        if (fileNames.length === 1) return fileNames[0]
        if (previousMainFile && fileNames.includes(previousMainFile)) return previousMainFile
        return ''
    }, [mainFileOverride, previousMainFile, fileNames])

    const filesChanged = useMemo(
        () => hasChangedSinceLastJob(workspace.files, mainFile, lastJob),
        [workspace.files, mainFile, lastJob],
    )

    const isLaunching = isLaunchingWorkspace || isCreatingWorkspace
    const showEmptyState = fileNames.length === 0 && !workspace.isLoading && !userEditedFiles
    const canSubmit = mainFile !== '' && fileNames.length > 0 && filesChanged

    // OTTER-647: the main file is required but is a star toggle with no field to blur, so the
    // reason is named beside the disabled button instead of through useField.
    const submitDisabledReason = (() => {
        if (fileNames.length === 0) return null
        if (mainFile === '') return 'Select a main file to submit'
        if (!filesChanged) return 'Modify a file or upload new ones before submitting'
        return null
    })()

    const setMainFile = useCallback((fileName: string) => {
        setMainFileOverride(fileName)
        setUserEditedFiles(true)
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
            setUserEditedFiles(true)
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
            setUserEditedFiles(true)
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
                    'Your code has been successfully submitted to the Data Partner. Check your dashboard for status updates.',
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
        launchStatus,
        launchLastUpdatedAt,
        launchBuildLog,
        launchAgentLog,

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

        filesChanged,
        userEditedFiles,

        starterFiles: starterCodeInfo?.starterFiles ?? [],
    }
}
