import { useQuery } from '@/common'
import { listWorkspaceFilesAction } from '@/server/actions/workspaces.actions'

export type WorkspaceFileInfo = { name: string; size: number; mtime: string }

export interface UseWorkspaceFilesOptions {
    studyId: string
    enabled: boolean
    refetchInterval?: number
}

export interface UseWorkspaceFilesReturn {
    files: WorkspaceFileInfo[]
    suggestedMain: string | null
    lastModified: string | null
    isLoading: boolean
    refetch: () => void
}

export function useWorkspaceFiles(props: UseWorkspaceFilesOptions): UseWorkspaceFilesReturn {
    const { studyId, enabled } = props
    const {
        data,
        isLoading: isInitialLoad,
        refetch,
    } = useQuery({
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
        isLoading: isInitialLoad,
        refetch,
    }
}
