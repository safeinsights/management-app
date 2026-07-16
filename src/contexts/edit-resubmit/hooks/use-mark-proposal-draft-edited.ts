import { useEffect, useRef } from 'react'
import { useMutation } from '@/common'
import { markProposalDraftEditedAction } from '@/server/actions/study-request'

// OTTER-636: the first real edit to a previously submitted proposal flips it to DRAFT ("Proposal
// draft"). Proposal fields persist through Yjs (there is no per-edit server action to hang the flip
// on), so a client signal drives it. Fires once per mount the moment `hasEdited` first turns true;
// the server action is idempotent, so a study already flipped (or not change-requested) is a no-op.
// Merely opening the page never fires it — hasEdited only turns true on a real field/note edit.
export function useMarkProposalDraftEdited(studyId: string, hasEdited: boolean) {
    const firedRef = useRef(false)
    const { mutate } = useMutation({ mutationFn: () => markProposalDraftEditedAction({ studyId }) })

    useEffect(() => {
        if (!hasEdited || firedRef.current) return
        firedRef.current = true
        mutate()
    }, [hasEdited, mutate])
}
