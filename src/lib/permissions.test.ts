import { test, expect } from 'vitest'

import type { UserSession, UserOrgRoles } from './types'
import { faker } from '@faker-js/faker'
import { defineAbilityFor, toRecord } from './permissions'

const createAbilty = (
    roles: Partial<UserOrgRoles> = {},
    orgType: 'enclave' | 'lab' = 'enclave',
    { isSiAdmin = false }: { isSiAdmin?: boolean } = {},
) => {
    const org = {
        id: faker.string.uuid(),
        type: orgType,
        slug: 'test',
        isAdmin: false,
        ...roles,
    }
    const session: UserSession = {
        user: {
            id: faker.string.uuid(),
            clerkUserId: faker.string.alpha(),
            isSiAdmin,
        },
        orgs: {
            test: org,
        },
    }
    return { ability: defineAbilityFor(session), session }
}

test('reviewer role', () => {
    const { ability, session } = createAbilty({}, 'enclave')
    expect(
        // reviewer can approve studies for their enclave org
        ability.can('approve', toRecord('Study', { orgId: session.orgs.test.id })),
    ).toBeTruthy()

    expect(ability.can('update', toRecord('Study', { orgId: session.orgs.test.id }))).toBeFalsy()
    // Non-admins cannot invite users - they need to provide an orgId where they're admin
    expect(ability.can('invite', toRecord('User', { orgId: session.orgs.test.id }))).toBe(false)
    expect(ability.can('update', toRecord('User', { id: session.user.id }))).toBe(true)
    expect(ability.can('update', toRecord('User', { id: faker.string.uuid() }))).toBe(false)

    // enclave members hold a key to decrypt results for review
    expect(ability.can('view', 'UserKey')).toBe(true)
    expect(ability.can('update', 'UserKey')).toBe(true)
})

test('researcher role', () => {
    const { ability, session } = createAbilty({}, 'lab')
    const ownLabId = session.orgs.test.id
    const otherLabId = faker.string.uuid()

    expect(
        // researchers cannot approve studies
        ability.can('approve', toRecord('Study', { orgId: ownLabId })),
    ).toBe(false)

    expect(ability.can('create', 'Study')).toBe(true)

    // update/delete are scoped to studies the researcher's own lab submitted
    expect(ability.can('update', toRecord('Study', { submittedByOrgId: ownLabId }))).toBe(true)
    expect(ability.can('delete', toRecord('Study', { submittedByOrgId: ownLabId }))).toBe(true)
    expect(ability.can('create', toRecord('StudyJob', { submittedByOrgId: ownLabId }))).toBe(true)

    // ...but not studies submitted by a different lab
    expect(ability.can('update', toRecord('Study', { submittedByOrgId: otherLabId }))).toBe(false)
    expect(ability.can('delete', toRecord('Study', { submittedByOrgId: otherLabId }))).toBe(false)
    expect(ability.can('create', toRecord('StudyJob', { submittedByOrgId: otherLabId }))).toBe(false)

    // Researchers cannot invite users to their org (not admins)
    expect(ability.can('invite', toRecord('User', { orgId: ownLabId }))).toBe(false)

    // lab members also hold a key now, to decrypt approved results
    expect(ability.can('view', 'UserKey')).toBe(true)
    expect(ability.can('update', 'UserKey')).toBe(true)
})

test('admin role', () => {
    const { ability, session } = createAbilty({ isAdmin: true })
    expect(ability.can('approve', 'Study')).toBeTruthy()
    expect(ability.can('approve', toRecord('Study', { orgId: session.orgs.test.id }))).toBeTruthy()
    expect(ability.can('invite', toRecord('User', { orgId: session.orgs.test.id }))).toBe(true)
    expect(ability.can('update', toRecord('User', { orgId: session.orgs.test.id }))).toBe(true)
    expect(ability.can('update', toRecord('User', { id: faker.string.uuid(), orgId: faker.string.uuid() }))).toBe(false)
})

test('SI admin can review studies for orgs they do not belong to', () => {
    // The SI admin's only membership is the 'test' enclave org, but they must be able to review
    // a study reviewed by a DIFFERENT org (the original bug: enumerated grants omitted review).
    const { ability } = createAbilty({}, 'enclave', { isSiAdmin: true })
    const otherOrgId = faker.string.uuid()

    expect(ability.can('review', toRecord('Study', { orgId: otherOrgId }))).toBe(true)
    expect(ability.can('approve', toRecord('Study', { orgId: otherOrgId }))).toBe(true)
    expect(ability.can('reject', toRecord('Study', { orgId: otherOrgId }))).toBe(true)
})

test('SI admin (manage/all) grants every action across subjects', () => {
    const { ability } = createAbilty({}, 'enclave', { isSiAdmin: true })
    const someOrg = faker.string.uuid()

    expect(ability.can('update', toRecord('Study', { orgId: someOrg }))).toBe(true)
    expect(ability.can('delete', toRecord('Study', { orgId: someOrg }))).toBe(true)
    expect(ability.can('create', 'StudyJob')).toBe(true)
    expect(ability.can('view', toRecord('StudyJob', { orgId: someOrg }))).toBe(true)
    expect(ability.can('create', 'Org')).toBe(true)
    expect(ability.can('delete', toRecord('Org', { orgId: someOrg }))).toBe(true)
    expect(ability.can('invite', toRecord('User', { orgId: someOrg }))).toBe(true)
    expect(ability.can('view', 'OrgStudies')).toBe(true)
})

test('non-SI-admin is still bounded (manage/all does not leak to regular users)', () => {
    // Guards the wildcard: a plain enclave reviewer must NOT gain blanket permission.
    const { ability } = createAbilty({}, 'enclave', { isSiAdmin: false })
    const otherOrgId = faker.string.uuid()

    expect(ability.can('review', toRecord('Study', { orgId: otherOrgId }))).toBe(false)
    expect(ability.can('delete', toRecord('Org', { orgId: otherOrgId }))).toBe(false)
    expect(ability.can('create', 'Org')).toBe(false)
})
