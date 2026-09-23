import { useQuery } from '@/common'
import { listWorkspaceFilesAction } from '@/server/actions/workspaces.actions'

/**
 * Null when nothing has been recorded, which the Last activity column shows as "No activity yet".
 * Only uploads and IDE-edit clicks are recorded, so a starter file a launch copied in has none
 * until someone touches it (OTTER-693).
 */
export type WorkspaceFileActivitySummary = {
    actorName: string
    action: 'UPLOADED' | 'EDITED_IN_IDE'
    createdAt: string
}

export type WorkspaceFileInfo = {
    name: string
    size: number
    mtime: string
    /** Optional rather than required so fixtures predating the column stay valid; absent reads as null. */
    lastActivity?: WorkspaceFileActivitySummary | null
}

export interface UseWorkspaceFilesOptions {
    studyId: string
    enabled: boolean
    refetchInterval?: number
}

export interface UseWorkspaceFilesReturn {
    files: WorkspaceFileInfo[]
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
        queryFn: () => listWorkspaceFilesAction({ studyId }),
        enabled,
        refetchInterval: enabled ? (props.refetchInterval ?? false) : false,
    })

    return {
        files: data?.files ?? [],
        lastModified: data?.lastModified ?? null,
        isLoading: isInitialLoad,
        refetch,
    }
}
