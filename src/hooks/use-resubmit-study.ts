import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { reportMutationError } from '@/components/errors'
import { actionResult } from '@/lib/utils'
import { errorToString, isActionError } from '@/lib/errors'
import logger from '@/lib/logger'
import { Routes } from '@/lib/routes'
import { addJobToStudyAction, onDeleteStudyJobAction, submitStudyFromIDEAction } from '@/server/actions/study-request'
import { listWorkspaceFilesAction } from '@/server/actions/workspaces.actions'
import { useWorkspaceLauncher } from '@/hooks/use-workspace-launcher'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import {
    useResubmitCodeStore,
    useResubmitViewMode,
    useUploadedFiles,
    useUploadMainFile,
    useCanSubmitUpload,
    useIdeMainFile,
    useHasImportedFromIDE,
    useRemovedIdeFiles,
    getFilteredIdeFiles,
    getCurrentIdeMainFile,
    canSubmitIDE,
    getUploadPayload,
    getIdePayload,
} from '@/stores/resubmit-code.store'
import type { SelectedStudy } from '@/server/actions/study.actions'

export function useResubmitStudy(study: SelectedStudy) {
    const router = useRouter()
    const queryClient = useQueryClient()

    // Store state
    const store = useResubmitCodeStore()
    const viewMode = useResubmitViewMode()
    const uploadedFiles = useUploadedFiles()
    const uploadMainFile = useUploadMainFile()
    const ideMainFile = useIdeMainFile()
    const hasImportedFromIDE = useHasImportedFromIDE()
    const removedIdeFiles = useRemovedIdeFiles()

    const orgSlug = study.submittedByOrgSlug!

    // Initialize store on mount
    useEffect(() => {
        if (!study.submittedByOrgSlug) {
            throw new Error('Submitting organization not found for study')
        }
        store.init({
            id: study.id,
            orgSlug: study.orgSlug,
            submittedByOrgSlug: study.submittedByOrgSlug,
            language: study.language,
        })
        return () => store.reset()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [study.id])

    // Workspace launcher
    const {
        launchWorkspace,
        isLaunching: isLaunchingWorkspace,
        isCreatingWorkspace,
        error: launchError,
    } = useWorkspaceLauncher({
        studyId: study.id,
        onSuccess: () => store.goToImportIDE(),
    })

    const isIDELoading = isLaunchingWorkspace || isCreatingWorkspace
    const { messageWithEllipsis: ideLoadingMessage } = useLoadingMessages(isIDELoading)

    // Query for workspace files
    const {
        data: workspaceData,
        isFetching: isLoadingFiles,
        refetch: refetchFiles,
    } = useQuery({
        queryKey: ['workspace-files', study.id],
        queryFn: async () => {
            const result = await listWorkspaceFilesAction({ studyId: study.id })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
            return result
        },
        enabled: hasImportedFromIDE,
    })

    // Computed IDE state
    const filteredIdeFiles = getFilteredIdeFiles(workspaceData?.files ?? [], removedIdeFiles)
    const currentIdeMainFile = getCurrentIdeMainFile(ideMainFile, workspaceData?.suggestedMain, filteredIdeFiles)
    const lastModified = workspaceData?.lastModified ?? null
    const showEmptyState = !hasImportedFromIDE || (filteredIdeFiles.length === 0 && !isLoadingFiles)

    // Submission validation
    const canSubmitUpload = useCanSubmitUpload()
    const canSubmitFromIDE = canSubmitIDE(currentIdeMainFile, filteredIdeFiles)

    const handleImportFiles = () => {
        store.markAsImported()
        refetchFiles()
        notifications.show({
            title: 'Files imported',
            message: 'File list has been updated from the IDE.',
            color: 'blue',
        })
    }

    // Mutation for resubmitting
    const { isPending, mutate: resubmitStudy } = useMutation({
        mutationFn: async () => {
            // IDE submission flow
            if (viewMode === 'import-ide') {
                const idePayload = getIdePayload(currentIdeMainFile, filteredIdeFiles)
                if (!idePayload) throw new Error('Invalid IDE submission state')

                const result = await submitStudyFromIDEAction({
                    studyId: study.id,
                    mainFileName: idePayload.mainFileName,
                    fileNames: idePayload.fileNames,
                })
                if ('error' in result) {
                    throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
                }
                return
            }

            // File upload flow
            const uploadPayload = getUploadPayload(uploadedFiles, uploadMainFile)
            if (!uploadPayload) throw new Error('Invalid upload submission state')

            const { urlForCodeUpload, studyJobId } = actionResult(
                await addJobToStudyAction({
                    studyId: study.id,
                    mainCodeFileName: uploadPayload.mainFileName,
                    codeFileNames: uploadPayload.additionalCodeFiles.map((f) => f.name),
                }),
            )

            try {
                await uploadFiles([
                    [uploadPayload.mainCodeFile, urlForCodeUpload],
                    ...uploadPayload.additionalCodeFiles.map((f) => [f, urlForCodeUpload] as FileUpload),
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
        onSuccess() {
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['workspace-files', study.id] })
            store.reset()
            notifications.show({
                title: 'Study Resubmitted',
                message:
                    'Your study has been successfully resubmitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })
            router.push(Routes.studyView({ orgSlug, studyId: study.id }))
        },
        onError: reportMutationError('Failed to resubmit study'),
    })

    return {
        // State
        viewMode,
        uploadedFiles,
        uploadMainFile,
        filteredIdeFiles,
        currentIdeMainFile,
        lastModified,
        showEmptyState,
        isLoadingFiles,
        isIDELoading,
        ideLoadingMessage,
        launchError,
        isPending,
        canSubmitUpload,
        canSubmitFromIDE,

        // Actions
        store,
        launchWorkspace,
        handleImportFiles,
        resubmitStudy,
    }
}
