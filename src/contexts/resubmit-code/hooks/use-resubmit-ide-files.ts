import { useState, useCallback } from 'react'
import { notifications } from '@mantine/notifications'
import { useWorkspaceFiles } from '@/hooks/use-workspace-files'
import { useFileListManager } from '@/hooks/use-file-list-manager'

export interface UseResubmitIDEFilesOptions {
    studyId: string
}

export interface UseResubmitIDEFilesReturn {
    filteredIdeFiles: string[]
    currentIdeMainFile: string
    hasImportedFromIDE: boolean
    lastModified: string | null
    isLoadingFiles: boolean
    showEmptyState: boolean
    canSubmitFromIDE: boolean
    setIdeMainFile: (fileName: string) => void
    removeIdeFile: (fileName: string) => void
    handleImportFiles: () => void
}

export function useResubmitIDEFiles({ studyId }: UseResubmitIDEFilesOptions): UseResubmitIDEFilesReturn {
    const [hasImportedFromIDE, setHasImported] = useState(false)

    const workspace = useWorkspaceFiles({ studyId, enabled: hasImportedFromIDE })

    const fileManager = useFileListManager({
        files: workspace.files,
        suggestedMain: workspace.suggestedMain,
    })

    const handleImportFiles = useCallback(() => {
        setHasImported(true)
        fileManager.reset()
        workspace.refetch()
        notifications.show({
            title: 'Files imported',
            message: 'File list has been updated from the IDE.',
            color: 'blue',
        })
    }, [fileManager, workspace])

    const showEmptyState = !hasImportedFromIDE || (fileManager.filteredFiles.length === 0 && !workspace.isLoading)
    const canSubmitFromIDE = fileManager.mainFile !== '' && fileManager.filteredFiles.length > 0

    return {
        filteredIdeFiles: fileManager.filteredFiles,
        currentIdeMainFile: fileManager.mainFile,
        hasImportedFromIDE,
        lastModified: workspace.lastModified,
        isLoadingFiles: workspace.isLoading,
        showEmptyState,
        canSubmitFromIDE,
        setIdeMainFile: fileManager.setMainFile,
        removeIdeFile: fileManager.removeFile,
        handleImportFiles,
    }
}
