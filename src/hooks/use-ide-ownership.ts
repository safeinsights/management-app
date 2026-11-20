import { useQuery } from '@/common'
import { getIdeOwnerAction } from '@/server/actions/workspaces.actions'
import { queryKeys } from '@/lib/query-keys'

/**
 * OTTER-693: a study's IDE locks to the first researcher who launches it. This owns that read and
 * the states the launch controls derive from it, so the pencil and the Launch IDE button cannot
 * disagree about who holds it.
 */
export function useIdeOwnership(studyId: string) {
    const { data: ideOwner } = useQuery({
        queryKey: queryKeys.ideOwner(studyId),
        queryFn: () => getIdeOwnerAction({ studyId }),
    })

    return {
        // Unclaimed reads as editable: the card enables the IDE controls for everyone until the
        // first launch takes them. Undefined while the query is in flight, hence the `!== true`.
        canEditInIde: ideOwner?.isClaimed !== true || ideOwner.isOwnedByViewer,
        // Distinct from canEditInIde, which is also true when nobody has claimed it: the Launch IDE
        // button needs the two apart to pick its solid-vs-outline variant.
        isIdeClaimed: ideOwner?.isClaimed === true,
        ideOwnerName: ideOwner?.ownerName ?? null,
    }
}
