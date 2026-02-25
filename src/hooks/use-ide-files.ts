import { useQueryClient } from '@/common'
import { Routes } from '@/lib/routes'
import { notifications } from '@mantine/notifications'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspaceLauncher } from './use-workspace-launcher'
import { useWorkspaceFiles } from './use-workspace-files'
import { useFileListManager } from './use-file-list-manager'
import { useStudyRequest } from '@/contexts/study-request'

interface UseIDEFilesOptions {
    studyId: string
    orgSlug: string
}

export function useIDEFiles({ studyId, orgSlug }: UseIDEFilesOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { setIDECodeFiles, submitStudy, mainFileName } = useStudyRequest()

    const pendingDirectSubmitRef = useRef(false)
    const [isDirectSubmitting, setIsDirectSubmitting] = useState(false)

    const {
        launchWorkspace,
        isLaunching: isLaunchingWorkspace,
        isCreatingWorkspace,
        error: launchError,
    } = useWorkspaceLauncher({ studyId })

    const workspace = useWorkspaceFiles({ studyId, enabled: true, refetchInterval: 5000 })

    const fileManager = useFileListManager({
        files: workspace.files,
        suggestedMain: workspace.suggestedMain,
    })

    const isLaunching = isLaunchingWorkspace || isCreatingWorkspace
    const showEmptyState = fileManager.filteredFiles.length === 0 && !workspace.isLoading
    const canSubmit = fileManager.mainFile !== '' && fileManager.filteredFiles.length > 0

    const goBack = useCallback(() => {
        router.push(Routes.studyCode({ orgSlug, studyId }))
    }, [router, orgSlug, studyId])

    const proceedToReview = useCallback(() => {
        if (!canSubmit) {
            notifications.show({
                color: 'red',
                title: 'Cannot proceed',
                message: 'Please import files and select a main file first.',
            })
            return
        }

        setIDECodeFiles(fileManager.mainFile, fileManager.filteredFiles)
        queryClient.invalidateQueries({ queryKey: ['workspace-files', studyId] })
        router.push(Routes.studyReview({ orgSlug, studyId }))
    }, [
        canSubmit,
        fileManager.mainFile,
        fileManager.filteredFiles,
        setIDECodeFiles,
        queryClient,
        studyId,
        router,
        orgSlug,
    ])

    const submitDirectly = useCallback(() => {
        if (!canSubmit) {
            notifications.show({
                color: 'red',
                title: 'Cannot proceed',
                message: 'Please import files and select a main file first.',
            })
            return
        }

        setIDECodeFiles(fileManager.mainFile, fileManager.filteredFiles)
        queryClient.invalidateQueries({ queryKey: ['workspace-files', studyId] })
        pendingDirectSubmitRef.current = true
        setIsDirectSubmitting(true)
    }, [canSubmit, fileManager.mainFile, fileManager.filteredFiles, setIDECodeFiles, queryClient, studyId])

    // Submit once context has updated with the new file names
    useEffect(() => {
        if (pendingDirectSubmitRef.current && mainFileName) {
            pendingDirectSubmitRef.current = false
            submitStudy({ onSettled: () => setIsDirectSubmitting(false) })
        }
    }, [mainFileName, submitStudy])

    return {
        launchWorkspace,
        isLaunching,
        launchError,

        isLoadingFiles: workspace.isLoading,
        showEmptyState,
        lastModified: workspace.lastModified,

        files: fileManager.filteredFiles,
        mainFile: fileManager.mainFile,
        setMainFile: fileManager.setMainFile,
        removeFile: fileManager.removeFile,

        canSubmit,
        proceedToReview,
        submitDirectly,
        isDirectSubmitting,
        goBack,
    }
}
