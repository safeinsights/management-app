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
 * Pure so the rule can be tested without React or a live websocket, which is the half
 * {@link useCollabFieldsSaveStatus} cannot demonstrate in jsdom: with no socket the provider is
 * null and every status collapses to idle.
 */
export const collabFieldSaveStatus = (
    providerStatus: SaveStatusValue,
    editedKeys: ReadonlySet<CollabFieldKey>,
    key: CollabFieldKey,
    error: unknown,
): SaveStatusValue => (editedKeys.has(key) && !error ? providerStatus : 'idle')

/**
 * Binds {@link collabFieldSaveStatus} to a surface's form map.
 *
 * Both surfaces that co-edit the proposal fields doc need the identical rule: Step 2 of the draft
 * flow for datasets and PI, and the change-requested resubmit page for those two plus the title it
 * still owns. One definition rather than one per page, because this rule has already had to be
 * corrected twice (OTTER-594, OTTER-674) and a second copy could only drift.
 */
export function useCollabFieldsSaveStatus(yjsForm: ReturnType<typeof useYjsFormMap>) {
    const providerStatus = useProviderSaveStatus(yjsForm.provider)

    return (key: CollabFieldKey, error: unknown) =>
        collabFieldSaveStatus(providerStatus, yjsForm.editedKeys, key, error)
}
