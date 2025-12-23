import { useQuery } from '@/common'
import { listWorkspaceFilesAction } from '@/server/actions/workspaces.actions'

export interface UseWorkspaceFilesOptions {
    studyId: string
    enabled: boolean
}

export interface UseWorkspaceFilesReturn {
    files: string[]
    suggestedMain: string | null
    lastModified: string | null
    isLoading: boolean
    refetch: () => void
}

export function useWorkspaceFiles({ studyId, enabled }: UseWorkspaceFilesOptions): UseWorkspaceFilesReturn {
    const { data, isFetching, refetch } = useQuery({
        queryKey: ['workspace-files', studyId],
        queryFn: async () => {
            const result = await listWorkspaceFilesAction({ studyId })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
            return result
        },
        enabled,
    })

    return {
        files: data?.files ?? [],
        suggestedMain: data?.suggestedMain ?? null,
        lastModified: data?.lastModified ?? null,
        isLoading: isFetching,
        refetch,
    }
}
