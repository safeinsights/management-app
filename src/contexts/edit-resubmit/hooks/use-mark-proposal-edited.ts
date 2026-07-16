import { useCallback, useRef } from 'react'
import { useMutation } from '@/common'
import { markProposalEditedAction } from '@/server/actions/study-request'

// OTTER-636: the first real edit to a previously submitted (change-requested) proposal stamps a
// display-only "Proposal draft" signal (study.status stays CHANGE-REQUESTED, so the whole resubmission
// flow keeps working). Returns a stable `signalEdit` the editable inputs call on a genuine user edit.
//
// Fires the server action at most once per successful stamp. The latch is only set after the mutation
// succeeds, so a transient failure lets the next edit retry rather than suppressing the signal forever.
export function useMarkProposalEdited(studyId: string): () => void {
    const stampedRef = useRef(false)
    const inFlightRef = useRef(false)
    const { mutateAsync } = useMutation({ mutationFn: () => markProposalEditedAction({ studyId }) })

    return useCallback(() => {
        if (stampedRef.current || inFlightRef.current) return
        inFlightRef.current = true
        mutateAsync()
            .then(() => {
                stampedRef.current = true
            })
            .catch(() => {
                // Leave stampedRef false so a later edit retries; the action is idempotent.
            })
            .finally(() => {
                inFlightRef.current = false
            })
    }, [mutateAsync])
}
