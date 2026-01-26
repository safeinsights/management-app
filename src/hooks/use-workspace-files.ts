import { useQuery } from '@/common'
import { listWorkspaceFilesAction } from '@/server/actions/workspaces.actions'

export interface UseWorkspaceFilesOptions {
    studyId: string
    enabled: boolean
    refetchInterval?: number
}

export interface UseWorkspaceFilesReturn {
    files: string[]
    suggestedMain: string | null
    lastModified: string | null
    isLoading: boolean
    refetch: () => void
}

export function useWorkspaceFiles(props: UseWorkspaceFilesOptions): UseWorkspaceFilesReturn {
    const { studyId, enabled } = props
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
        refetchInterval: enabled ? (props.refetchInterval ?? false) : false,
    })

    return {
        files: data?.files ?? [],
        suggestedMain: data?.suggestedMain ?? null,
        lastModified: data?.lastModified ?? null,
        isLoading: isFetching,
        refetch,
    }
}
