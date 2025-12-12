import { useMutation, useQuery, useQueryClient } from '@/common'
import { errorToString } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { submitStudyFromIDEAction } from '@/lib/study-actions'
import { listWorkspaceFilesAction } from '@/server/actions/workspace-files.actions'
import { notifications } from '@mantine/notifications'
import { useRouter } from 'next/navigation'
import { useState, useCallback, useMemo } from 'react'
import { useWorkspaceLauncher } from './use-workspace-launcher'

interface UseIDEFilesOptions {
    studyId: string
    orgSlug: string
}

export function useIDEFiles({ studyId, orgSlug }: UseIDEFilesOptions) {
    const router = useRouter()
    const queryClient = useQueryClient()

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
        router.push(Routes.studyUpload({ orgSlug, studyId }))
    }, [router, orgSlug, studyId])

    const { isPending: isSubmitting, mutate: submit } = useMutation({
        mutationFn: async () => {
            if (!mainFile || files.length === 0) {
                throw new Error('Main file or files not set')
            }
            const result = await submitStudyFromIDEAction({
                studyId,
                mainFileName: mainFile,
                fileNames: files,
            })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
            return result
        },
        onSuccess: () => {
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

    return {
        // IDE Launch
        launchWorkspace,
        isLaunching,
        launchError,

        // File Import
        importFiles,
        isLoadingFiles,
        showEmptyState,
        lastModified,

        // File State
        files,
        mainFile,
        setMainFile,
        removeFile,

        // Submit
        canSubmit,
        isSubmitting,
        submit,
        goBack,
    }
}
