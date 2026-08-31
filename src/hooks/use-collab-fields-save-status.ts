'use client'

import { type CollabFieldKey } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { type SaveStatusValue } from '@/components/save-status'
import { type useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { useProviderSaveStatus } from '@/lib/realtime/use-provider-save-status'

/**
 * Whether one field of a shared Yjs fields doc may claim a save.
 *
 * The provider saves the whole doc, so its status is form-wide. A field surfaces it only after
 * the user has edited that field (OTTER-594 QA: a pristine field must not claim "All changes
 * saved"), and stands down while that field's validation error owns the row (OTTER-674).
 *
 * That last gate lives here rather than in `isVisible` on the indicator, and the two are not
 * interchangeable. Every surface using this hook draws several fields from one provider, so its
 * indicators pass `announce={false}` and a single `SaveStatusAnnouncer` speaks for all of them.
 * The announcer follows these statuses, so returning 'saved' behind an error would have it read
 * "All changes saved" while the error is still on screen. `isVisible` fits the opposite shape, one
 * indicator owning its own live region (the collaborative editors, the resubmission note), where
 * the region must stay mounted to announce a save that lands behind an error. Nothing is lost by
 * standing down: the provider's status is held in state and the field stays marked edited, so
 * clearing the error brings both the label and the announcement back.
 *
 * Pure so the rule can be tested without React or a live websocket.
 */
export const collabFieldSaveStatus = (
    providerStatus: SaveStatusValue,
    editedKeys: ReadonlySet<CollabFieldKey>,
    key: CollabFieldKey,
    error: unknown,
): SaveStatusValue => (editedKeys.has(key) && !error ? providerStatus : 'idle')

/**
 * The two parts of a form map this hook reads. Named rather than taking the map whole so the
 * dependency is visible, and so the hook can be driven with a small object.
 */
type CollabFieldsSaveSource = Pick<ReturnType<typeof useYjsFormMap>, 'provider' | 'editedKeys'>

/**
 * Binds {@link collabFieldSaveStatus} to a surface's form map.
 *
 * Both surfaces that co-edit the proposal fields doc need the identical rule: Step 2 of the draft
 * flow for datasets and PI, and the change-requested resubmit page for those two plus the title it
 * still owns. One definition rather than one per page, because this rule has already had to be
 * corrected twice (OTTER-594, OTTER-674) and a second copy could only drift.
 */
export function useCollabFieldsSaveStatus({ provider, editedKeys }: CollabFieldsSaveSource) {
    const providerStatus = useProviderSaveStatus(provider)

    return (key: CollabFieldKey, error: unknown) => collabFieldSaveStatus(providerStatus, editedKeys, key, error)
}
