import { useQuery } from '@/common'
import { listWorkspaceFilesAction } from '@/server/actions/workspace-files.actions'
import { notifications } from '@mantine/notifications'
import { useState, useCallback, useEffect } from 'react'
import { useWorkspaceLauncher } from './use-workspace-launcher'

interface UseIDEFilesOptions {
    studyId: string
    onChange?: (state: { files: string[]; mainFile: string }) => void
}

interface UseIDEFilesReturn {
    // IDE Launch
    launchWorkspace: () => void
    isLaunching: boolean
    launchError: Error | null

    // File Import
    importFiles: () => void
    isFetching: boolean
    hasImported: boolean
    lastModified: string | null

    // File State
    files: string[]
    mainFile: string
    setMainFile: (file: string) => void
    removeFile: (file: string) => void
}

export function useIDEFiles({ studyId, onChange }: UseIDEFilesOptions): UseIDEFilesReturn {
    const [hasImported, setHasImported] = useState(false)
    const [removedFiles, setRemovedFiles] = useState<Set<string>>(new Set())
    const [mainFileOverride, setMainFileOverride] = useState<string | null>(null)

    const {
        launchWorkspace,
        isLoading: isLaunchingWorkspace,
        isPending: isWorkspacePending,
        error: launchError,
    } = useWorkspaceLauncher({ studyId })

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['workspace-files', studyId],
        queryFn: async () => {
            const result = await listWorkspaceFilesAction({ studyId })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
            return result
        },
        enabled: hasImported,
    })

    // Derive actual values from query data + local modifications
    const files = (data?.files ?? []).filter((f) => !removedFiles.has(f))
    const mainFile = mainFileOverride ?? data?.suggestedMain ?? files[0] ?? ''

    // Notify parent when derived values change
    useEffect(() => {
        if (files.length > 0) {
            onChange?.({ files, mainFile })
        }
    }, [files, mainFile, onChange])

    const importFiles = useCallback(() => {
        setHasImported(true)
        setRemovedFiles(new Set())
        setMainFileOverride(null)
        refetch()
        notifications.show({
            title: 'Files imported',
            message: 'File list has been updated from the IDE.',
            color: 'blue',
        })
    }, [refetch])

    const setMainFile = useCallback((file: string) => {
        setMainFileOverride(file)
    }, [])

    const removeFile = useCallback(
        (fileName: string) => {
            setRemovedFiles((prev) => new Set(prev).add(fileName))

            // If removing the current main file, clear the override so it falls back to next available
            if (mainFileOverride === fileName) {
                setMainFileOverride(null)
            }
        },
        [mainFileOverride],
    )

    return {
        // IDE Launch
        launchWorkspace,
        isLaunching: isLaunchingWorkspace || isWorkspacePending,
        launchError,

        // File Import
        importFiles,
        isFetching: isFetching || isLoading,
        hasImported,
        lastModified: data?.lastModified ?? null,

        // File State
        files,
        mainFile,
        setMainFile,
        removeFile,
    }
}
