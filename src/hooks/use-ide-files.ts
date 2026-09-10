import { useMutation, useQuery, useQueryClient } from '@/common'
import { notifications } from '@mantine/notifications'
import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { reportMutationError } from '@/components/errors'
import { downloadBlob } from '@/lib/download-blob'
import { showUploadFailed, showUploadSucceeded } from '@/components/study/upload-notifications'
import { useUploadQueue } from './use-upload-queue'
import { useWorkspaceLauncher } from './use-workspace-launcher'
import { useWorkspaceFiles, type WorkspaceFileInfo } from './use-workspace-files'
import {
    uploadWorkspaceFileAction,
    deleteWorkspaceFileAction,
    readWorkspaceFileAction,
    recordWorkspaceFileEditAction,
} from '@/server/actions/workspace-files.actions'
import { submitStudyCodeAction } from '@/server/actions/study-request'
import {
    getIdeOwnerAction,
    getLastSubmissionInfoAction,
    getStarterCodeInfoAction,
} from '@/server/actions/workspaces.actions'

/** The Figma toast's wording for a request that failed rather than a file that was too big. */
const UPLOAD_RETRY_MESSAGE = 'Check your connection and try again.'

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
        // A launch is also what claims the IDE, so the owner has to be re-read or the launcher's
        // own pencil keeps rendering as if the study were still unclaimed.
        queryClient.invalidateQueries({ queryKey: ['ide-owner', studyId] })
    }, [queryClient, studyId])

    const {
        launchWorkspace,
        abandonLaunch,
        isLaunching: isLaunchingWorkspace,
        isCreatingWorkspace,
        error: launchError,
        clearError: clearLaunchError,
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

    const { data: ideOwner } = useQuery({
        queryKey: ['ide-owner', studyId],
        queryFn: () => getIdeOwnerAction({ studyId }),
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

    /**
     * OTTER-693: which files still carry the Data Partner's Template badge. A starter file is copied
     * in with its mtime deliberately backdated behind the baseline job (see
     * initializeWorkspaceCodeFiles), so an untouched template sits at or before that timestamp and
     * an edited or re-uploaded one has moved past it — the same signal `filesChanged` reads.
     *
     * Plural because starterCodeFileNames is, though orgs configure one in practice.
     */
    const templateFileNames = useMemo(() => {
        const starterNames = new Set((starterCodeInfo?.starterFiles ?? []).map((f) => f.name))
        if (starterNames.size === 0 || !lastJob) return []

        const baselineAt = new Date(lastJob.createdAt).getTime()
        return workspace.files
            .filter((f) => starterNames.has(f.name) && new Date(f.mtime).getTime() <= baselineAt)
            .map((f) => f.name)
    }, [starterCodeInfo, lastJob, workspace.files])

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

    /**
     * The pencil: records the intent to edit this file, then opens the workspace. Recorded before
     * launching so the Last activity column reflects the click even if the launch then fails —
     * the card defines the event as the click, and we cannot see inside the IDE either way.
     */
    const editFileInIde = useCallback(
        async (fileName: string) => {
            await recordWorkspaceFileEditAction({ studyId, fileName })
            queryClient.invalidateQueries({ queryKey: ['workspace-files', studyId] })
            launchWorkspace()
        },
        [studyId, queryClient, launchWorkspace],
    )

    // Reuses the same read as the viewer rather than a download route: workspace files live on disk
    // under the study's coder path, not in S3, so there is nothing to link to (OTTER-693).
    const downloadFile = useCallback(
        async (fileName: string) => {
            const result = await readWorkspaceFileAction({ studyId, fileName })
            if ('error' in result) {
                reportMutationError('Failed to download file')(result.error)
                return
            }
            downloadBlob(result.fileName, new Blob([result.contents]))
        },
        [studyId],
    )

    /**
     * OTTER-693 reports each file's outcome separately, so one bad file no longer abandons the rest
     * of the batch: every file is attempted and gets its own toast.
     */
    const uploadMutation = useMutation({
        mutationFn: async (filesToUpload: File[]) => {
            for (const file of filesToUpload) {
                const result = await uploadWorkspaceFileAction({ studyId, file })
                if ('error' in result) {
                    showUploadFailed(file.name, UPLOAD_RETRY_MESSAGE)
                    continue
                }
                showUploadSucceeded(file.name)
            }
        },
        onSettled: () => {
            invalidateFiles()
            queryClient.invalidateQueries({ queryKey: ['last-job', studyId] })
        },
        onError: reportMutationError('Failed to upload files'),
    })

    const startUpload = useCallback(
        (filesToUpload: File[]) => {
            setUserEditedFiles(true)
            uploadMutation.mutate(filesToUpload)
        },
        [uploadMutation],
    )

    const { uploadFiles, pendingDuplicate, resolveDuplicate } = useUploadQueue({
        existingNames: fileNames,
        startUpload,
    })

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
        abandonLaunch,
        launchError,
        clearLaunchError,
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
        downloadFile,
        editFileInIde,
        viewingFile,
        closeFileViewer,

        // Unclaimed reads as editable: the card enables the IDE controls for everyone until the
        // first launch takes them. Undefined while the query is in flight, hence the `!== false`.
        canEditInIde: ideOwner?.isClaimed !== true || ideOwner.isOwnedByViewer,
        // Distinct from canEditInIde, which is also true when nobody has claimed it: the Launch IDE
        // button needs the two apart to pick its solid-vs-outline variant.
        isIdeClaimed: ideOwner?.isClaimed === true,
        ideOwnerName: ideOwner?.ownerName ?? null,
        uploadFiles,
        pendingDuplicate,
        resolveDuplicate,
        isUploading: uploadMutation.isPending,
        isDeleting: deleteMutation.isPending,

        canSubmit,
        submitDisabledReason,
        submitDirectly,
        isDirectSubmitting: submitMutation.isPending,

        filesChanged,
        userEditedFiles,

        starterFiles: starterCodeInfo?.starterFiles ?? [],
        templateFileNames,
    }
}

/**
 * Lives here rather than beside any one consumer: the study-code card and the files block it
 * renders both take the whole hook return, and importing the type from either of them would
 * close a cycle between the two.
 */
export type StudyCodeIDE = ReturnType<typeof useIDEFiles>
