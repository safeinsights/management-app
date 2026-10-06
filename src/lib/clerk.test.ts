import { describe, expect, it } from '@/tests/unit.helpers'
import { publicMetadata, restoreMetadataPlan, slimMetadataPlan } from './clerk'

const orgs: UserInfo['orgs'] = { lab: { id: 'org-1', slug: 'lab', type: 'lab', isAdmin: false } }
const slim = { format: 'v3', user: { id: 'u1' }, teams: null } as const

describe('publicMetadata', () => {
    it('keeps the format and the user id, and drops the orgs', () => {
        expect(publicMetadata({ user: { id: 'u1' } })).toEqual({ format: 'v3', user: { id: 'u1' }, teams: null })
    })
})

describe('slimMetadataPlan', () => {
    it('removes the orgs of a v3 user', () => {
        expect(slimMetadataPlan({ ...slim, orgs })).toEqual({ action: 'write', metadata: slim })
    })

    it('keeps metadata that has no orgs', () => {
        expect(slimMetadataPlan(slim)).toEqual({ action: 'keep' })
    })

    // marshalSession() repairs these users, but only if their cookie stays under the size limit.
    it('removes orgs and teams from a user with no user.id and keeps every other key', () => {
        const legacy = { format: 'v2', orgs, teams: orgs, other: 'kept' } as unknown as UserPublicMetadata

        expect(slimMetadataPlan(legacy)).toEqual({
            action: 'write',
            metadata: { format: 'v2', other: 'kept' },
            legacy: true,
        })
    })
})

describe('restoreMetadataPlan', () => {
    it('writes the orgs from the database back for a user in the database', () => {
        expect(restoreMetadataPlan(slim, orgs)).toEqual({ action: 'write', metadata: { ...slim, orgs } })
    })

    it('keeps metadata that already holds the same orgs', () => {
        expect(restoreMetadataPlan({ ...slim, orgs }, orgs)).toEqual({ action: 'keep' })
    })

    it('skips a user that the database does not have', () => {
        expect(restoreMetadataPlan(slim, null)).toMatchObject({ action: 'skip' })
    })

    it('never touches a user with no user.id', () => {
        const legacy = { format: 'v2', other: 'kept' } as unknown as UserPublicMetadata

        expect(restoreMetadataPlan(legacy, orgs)).toMatchObject({ action: 'skip' })
    })
})
