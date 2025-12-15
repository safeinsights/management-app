import { useQuery, useQueryClient } from '@/common'
import { Routes } from '@/lib/routes'
import { listWorkspaceFilesAction } from '@/server/actions/workspace-files.actions'
import { notifications } from '@mantine/notifications'
import { useRouter } from 'next/navigation'
import { useState, useCallback, useMemo } from 'react'
import { useWorkspaceLauncher } from './use-workspace-launcher'
import { useStudyRequestStore } from '@/stores/study-request.store'

interface UseIDEFilesOptions {
    studyId: string
    orgSlug: string
}

export function useIDEFiles({ studyId, orgSlug }: UseIDEFilesOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const store = useStudyRequestStore()

    const [hasImported, setHasImported] = useState(false)
    const [removedFiles, setRemovedFiles] = useState<Set<string>>(new Set())
    const [mainFileOverride, setMainFileOverride] = useState<string | null>(null)

    const {
        launchWorkspace,
        isLaunching: isLaunchingWorkspace,
        isCreatingWorkspace,
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

    const files = useMemo(() => (data?.files ?? []).filter((f) => !removedFiles.has(f)), [data?.files, removedFiles])
    const mainFile = mainFileOverride ?? data?.suggestedMain ?? files[0] ?? ''
    const lastModified = data?.lastModified ?? null

    const isLaunching = isLaunchingWorkspace || isCreatingWorkspace
    const isLoadingFiles = isFetching || isLoading
    const showEmptyState = !hasImported || (files.length === 0 && !isLoadingFiles)
    const canSubmit = !!mainFile && files.length > 0

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
            if (mainFileOverride === fileName) {
                setMainFileOverride(null)
            }
        },
        [mainFileOverride],
    )

    const goBack = useCallback(() => {
        router.push(Routes.studyCode({ orgSlug, studyId }))
    }, [router, orgSlug, studyId])

    const proceedToReview = useCallback(() => {
        if (!mainFile || files.length === 0) {
            notifications.show({
                color: 'red',
                title: 'Cannot proceed',
                message: 'Please import files and select a main file first.',
            })
            return
        }

        store.setIDECodeFiles(mainFile, files)

        queryClient.invalidateQueries({ queryKey: ['workspace-files', studyId] })

        router.push(Routes.studyReview({ orgSlug, studyId }))
    }, [mainFile, files, store, queryClient, studyId, router, orgSlug])

    return {
        launchWorkspace,
        isLaunching,
        launchError,

        importFiles,
        isLoadingFiles,
        showEmptyState,
        lastModified,

        files,
        mainFile,
        setMainFile,
        removeFile,

        canSubmit,
        proceedToReview,
        goBack,
    }
}
