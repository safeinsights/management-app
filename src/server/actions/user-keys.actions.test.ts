import { describe, expect, it } from 'vitest'
import {
    mockSessionWithTestData,
    actionResult,
    faker,
    insertClaimedInvite,
    insertTestOrg,
    mockKeylessSession,
    readTestSupportFile,
} from '@/tests/unit.helpers'
import {
    getKeyPageStateAction,
    getUserPublicKeyAction,
    setUserPublicKeyAction,
    updateUserPublicKeyAction,
} from './user-keys.actions'
import { db } from '@/database'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util'

async function validTestKey() {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    return { publicKey, fingerprint: await fingerprintKeyData(publicKey) }
}

describe('User Keys Actions', () => {
    it('allows lab researchers to access the actions, since they now hold keys too', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const publicKey = Buffer.from('lab-public-key')
        const fingerprint = 'lab-fingerprint'
        await db.insertInto('userPublicKey').values({ userId: user.id, publicKey, fingerprint }).execute()

        const result = actionResult(await getUserPublicKeyAction())
        expect(result?.fingerprint).toEqual(fingerprint)
    })

    it('getUserPublicKeyAction returns the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const publicKey = Buffer.from('test-public-key')
        const fingerprint = 'test-fingerprint'

        await db.insertInto('userPublicKey').values({ userId: user.id, publicKey, fingerprint }).execute()

        const result = actionResult(await getUserPublicKeyAction())
        expect(result).toBeDefined()
        expect(result?.fingerprint).toEqual(fingerprint)
    })

    it('setUserPublicKeyAction sets the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const { publicKey, fingerprint } = await validTestKey()

        await setUserPublicKeyAction({ publicKey })

        const newKeyResult = actionResult(await getUserPublicKeyAction())
        expect(newKeyResult).toBeDefined()
        expect(newKeyResult?.fingerprint).toEqual(fingerprint)
    })

    it('setUserPublicKeyAction rejects a key that is not valid SPKI DER', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()

        const result = await setUserPublicKeyAction({
            publicKey: Buffer.from('not-a-real-key').buffer,
        })

        expect(isActionError(result)).toBe(true)
        const stored = actionResult(await getUserPublicKeyAction())
        expect(stored).toBeFalsy()
    })

    it('updateUserPublicKeyAction updates the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData()
        const oldPublicKey = Buffer.from('old-public-key')
        const oldFingerprint = 'old-fingerprint'
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: oldPublicKey, fingerprint: oldFingerprint })
            .execute()

        const { publicKey, fingerprint } = await validTestKey()

        await updateUserPublicKeyAction({ publicKey })

        const updatedKeyResult = actionResult(await getUserPublicKeyAction())
        expect(updatedKeyResult).toBeDefined()
        expect(updatedKeyResult?.fingerprint).toEqual(fingerprint)
    })

    it('updateUserPublicKeyAction rejects a key that is not valid SPKI DER', async () => {
        const { user } = await mockSessionWithTestData()
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: Buffer.from('old-public-key'), fingerprint: 'old-fingerprint' })
            .execute()

        const result = await updateUserPublicKeyAction({
            publicKey: Buffer.from('still-not-a-key').buffer,
        })

        expect(isActionError(result)).toBe(true)
        const stored = actionResult(await getUserPublicKeyAction())
        expect(stored?.fingerprint).toEqual('old-fingerprint')
    })

    it('stores the generation date, and a rotation advances it without losing the original', async () => {
        const { user } = await mockSessionWithTestData()
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const { publicKey } = await validTestKey()
        const readTimestamps = () =>
            db
                .selectFrom('userPublicKey')
                .select(['createdAt', 'updatedAt'])
                .where('userId', '=', user.id)
                .executeTakeFirstOrThrow()

        await setUserPublicKeyAction({ publicKey })
        const created = await readTimestamps()

        await updateUserPublicKeyAction({ publicKey })
        const rotated = await readTimestamps()

        // Inequality rather than ordering: the insert's timestamp is the DB default and the
        // rotation's comes from the app, so clock skew must not decide this.
        expect(rotated.createdAt).toEqual(created.createdAt)
        expect(rotated.updatedAt).not.toEqual(created.updatedAt)
    })
})

describe('getKeyPageStateAction', () => {
    const joinOrg = async (userId: string) => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10) })
        await db.insertInto('orgUser').values({ userId, orgId: org.id, isAdmin: false }).execute()
        return org
    }

    const setJoinedAt = async (userId: string, orgId: string, joinedAt: Date) => {
        await db
            .updateTable('orgUser')
            .set({ joinedAt })
            .where('userId', '=', userId)
            .where('orgId', '=', orgId)
            .executeTakeFirstOrThrow()
    }

    it('returns the dashboard of the org whose invite the account claimed', async () => {
        const { user, org } = await mockKeylessSession()
        await insertClaimedInvite({ userId: user.id, orgId: org.id })

        expect(actionResult(await getKeyPageStateAction())).toEqual({
            hasKey: false,
            firstKeyRedirect: Routes.orgDashboard({ orgSlug: org.slug }),
        })
    })

    it('returns the org dashboard for a lab account the same way it does for an enclave account', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })
        await insertClaimedInvite({ userId: user.id, orgId: org.id })

        expect(actionResult(await getKeyPageStateAction())).toEqual({
            hasKey: false,
            firstKeyRedirect: Routes.orgDashboard({ orgSlug: org.slug }),
        })
    })

    it('returns the inviting org for an account that belongs to more than one org', async () => {
        const { user } = await mockKeylessSession()
        const invitingOrg = await joinOrg(user.id)
        await insertClaimedInvite({ userId: user.id, orgId: invitingOrg.id })

        expect(actionResult(await getKeyPageStateAction())).toEqual({
            hasKey: false,
            firstKeyRedirect: Routes.orgDashboard({ orgSlug: invitingOrg.slug }),
        })
    })

    it('prefers the org whose invite the account accepted last, not the newest invite', async () => {
        const { user, org } = await mockKeylessSession()
        const newerInviteOrg = await joinOrg(user.id)
        await insertClaimedInvite({ userId: user.id, orgId: org.id, createdAt: new Date('2026-01-01') })
        await insertClaimedInvite({ userId: user.id, orgId: newerInviteOrg.id, createdAt: new Date('2026-01-02') })
        await setJoinedAt(user.id, newerInviteOrg.id, new Date('2026-01-03'))
        await setJoinedAt(user.id, org.id, new Date('2026-01-04'))

        expect(actionResult(await getKeyPageStateAction())).toEqual({
            hasKey: false,
            firstKeyRedirect: Routes.orgDashboard({ orgSlug: org.slug }),
        })
    })

    it('skips a claimed invite to an org the account has since left', async () => {
        const { user, org } = await mockKeylessSession()
        const leftOrg = await insertTestOrg({ slug: faker.string.alpha(10) })
        await insertClaimedInvite({ userId: user.id, orgId: org.id })
        await insertClaimedInvite({ userId: user.id, orgId: leftOrg.id })

        expect(actionResult(await getKeyPageStateAction())).toEqual({
            hasKey: false,
            firstKeyRedirect: Routes.orgDashboard({ orgSlug: org.slug }),
        })
    })

    it('falls back to My studies for a single-org account with no claimed invite', async () => {
        await mockKeylessSession()

        expect(actionResult(await getKeyPageStateAction())).toEqual({
            hasKey: false,
            firstKeyRedirect: Routes.dashboard,
        })
    })

    it('falls back to My studies when the account belongs to no org', async () => {
        const { user } = await mockKeylessSession()
        await db.deleteFrom('orgUser').where('userId', '=', user.id).execute()

        expect(actionResult(await getKeyPageStateAction())).toEqual({
            hasKey: false,
            firstKeyRedirect: Routes.dashboard,
        })
    })

    it('reports an existing key and skips the org resolution', async () => {
        await mockSessionWithTestData()

        expect(actionResult(await getKeyPageStateAction())).toEqual({
            hasKey: true,
            firstKeyRedirect: Routes.dashboard,
        })
    })
})
