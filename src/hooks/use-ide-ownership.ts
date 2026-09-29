import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@/common'
import { getIdeOwnerAction } from '@/server/actions/workspaces.actions'

const QUERY_KEY = 'ide-owner'

/**
 * OTTER-693: a study's IDE locks to the first researcher who launches it. This owns that read and
 * the states the launch controls derive from it, so the pencil and the Launch IDE button cannot
 * disagree about who holds it.
 */
export function useIdeOwnership(studyId: string) {
    const queryClient = useQueryClient()

    const { data: ideOwner } = useQuery({
        queryKey: [QUERY_KEY, studyId],
        queryFn: () => getIdeOwnerAction({ studyId }),
    })

    // A launch is also what claims the IDE, so the owner has to be re-read or the launcher's own
    // pencil keeps rendering as if the study were still unclaimed.
    const refresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY, studyId] })
    }, [queryClient, studyId])

    return {
        // Unclaimed reads as editable: the card enables the IDE controls for everyone until the
        // first launch takes them. Undefined while the query is in flight, hence the `!== true`.
        canEditInIde: ideOwner?.isClaimed !== true || ideOwner.isOwnedByViewer,
        // Distinct from canEditInIde, which is also true when nobody has claimed it: the Launch IDE
        // button needs the two apart to pick its solid-vs-outline variant.
        isIdeClaimed: ideOwner?.isClaimed === true,
        ideOwnerName: ideOwner?.ownerName ?? null,
        refresh,
    }
}
