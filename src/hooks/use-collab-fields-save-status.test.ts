import { describe, expect, it } from '@/tests/unit.helpers'
import { type CollabFieldKey } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { collabFieldSaveStatus } from './use-collab-fields-save-status'

// The rule the two collaborative proposal surfaces share. Tested here rather than through either
// page: with no websocket in jsdom the provider is null and every rendered status collapses to
// idle, so a page-level test cannot exercise these branches at all.
describe('collabFieldSaveStatus', () => {
    const edited = (...keys: CollabFieldKey[]) => new Set<CollabFieldKey>(keys)

    it('surfaces the provider status on a field the user has edited', () => {
        expect(collabFieldSaveStatus('saved', edited('title'), 'title', undefined)).toBe('saved')
    })

    it('passes "saving" through as well, so the field can report an in-flight save', () => {
        expect(collabFieldSaveStatus('saving', edited('title'), 'title', undefined)).toBe('saving')
    })

    // OTTER-594 QA: the provider status is form-wide, so without this gate every pristine field
    // would claim "All changes saved" the moment any other field saved.
    it('stays idle on a field the user has not edited', () => {
        expect(collabFieldSaveStatus('saved', edited('datasets'), 'title', undefined)).toBe('idle')
    })

    it('stays idle when nothing has been edited at all', () => {
        expect(collabFieldSaveStatus('saved', edited(), 'title', undefined)).toBe('idle')
    })

    // OTTER-674: the error takes the slot the indicator would occupy, so the two can never co-exist.
    it('stands down while the field carries a validation error', () => {
        expect(collabFieldSaveStatus('saved', edited('title'), 'title', 'This field is required.')).toBe('idle')
    })

    it('scopes the error gate to the field that holds it', () => {
        const editedKeys = edited('title', 'datasets')

        expect(collabFieldSaveStatus('saved', editedKeys, 'title', 'This field is required.')).toBe('idle')
        expect(collabFieldSaveStatus('saved', editedKeys, 'datasets', undefined)).toBe('saved')
    })

    it('reports idle while the provider itself is idle, however the field was left', () => {
        expect(collabFieldSaveStatus('idle', edited('piName'), 'piName', undefined)).toBe('idle')
    })
})
