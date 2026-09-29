import { test, expect } from 'vitest'

import type { UserSession, UserOrgRoles } from './types'
import type { StudyStatus } from '@/database/types'
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
    expect(ability.can('approve', toRecord('Study', { orgId: session.orgs.test.id }))).toBeTruthy()

    expect(ability.can('update', toRecord('Study', { orgId: session.orgs.test.id }))).toBeFalsy()
    expect(ability.can('invite', toRecord('User', { orgId: session.orgs.test.id }))).toBe(false)
    expect(ability.can('update', toRecord('User', { id: session.user.id }))).toBe(true)
    expect(ability.can('update', toRecord('User', { id: faker.string.uuid() }))).toBe(false)
    expect(ability.can('view', 'UserKey')).toBe(true)
    expect(ability.can('update', 'UserKey')).toBe(true)
})

test('reviewer cannot view unsubmitted drafts, but can view submitted studies (OTTER-596)', () => {
    const { ability, session } = createAbilty({}, 'enclave')
    const orgId = session.orgs.test.id

    const draft: StudyStatus = 'DRAFT'
    expect(ability.can('view', toRecord('Study', { orgId, status: draft }))).toBe(false)
    expect(ability.can('view', toRecord('StudyJob', { orgId, status: draft }))).toBe(false)

    const submitted: StudyStatus[] = ['PENDING-REVIEW', 'CHANGE-REQUESTED', 'APPROVED', 'REJECTED', 'ARCHIVED']
    for (const status of submitted) {
        expect(ability.can('view', toRecord('Study', { orgId, status }))).toBe(true)
        expect(ability.can('view', toRecord('StudyJob', { orgId, status }))).toBe(true)
    }

    expect(ability.can('view', toRecord('Study', { orgId }))).toBe(false)
    expect(ability.can('view', toRecord('StudyJob', { orgId }))).toBe(false)
})

test('lab members can still view their own lab drafts (OTTER-596 regression guard)', () => {
    const { ability, session } = createAbilty({}, 'lab')
    const submittedByOrgId = session.orgs.test.id
    const otherLabId = faker.string.uuid()
    const draft: StudyStatus = 'DRAFT'

    expect(ability.can('view', toRecord('Study', { submittedByOrgId, status: draft }))).toBe(true)
    expect(ability.can('view', toRecord('StudyJob', { submittedByOrgId, status: draft }))).toBe(true)

    expect(ability.can('view', toRecord('Study', { submittedByOrgId: otherLabId, status: draft }))).toBe(false)
})

test('researcher role', () => {
    const { ability, session } = createAbilty({}, 'lab')
    const ownLabId = session.orgs.test.id
    const otherLabId = faker.string.uuid()

    expect(ability.can('approve', toRecord('Study', { orgId: ownLabId }))).toBe(false)

    expect(ability.can('create', toRecord('Study', { submittedByOrgId: ownLabId }))).toBe(true)
    expect(ability.can('update', toRecord('Study', { submittedByOrgId: ownLabId }))).toBe(true)
    expect(ability.can('delete', toRecord('Study', { submittedByOrgId: ownLabId }))).toBe(true)
    expect(ability.can('create', toRecord('StudyJob', { submittedByOrgId: ownLabId }))).toBe(true)

    expect(ability.can('create', toRecord('Study', { submittedByOrgId: otherLabId }))).toBe(false)
    expect(ability.can('update', toRecord('Study', { submittedByOrgId: otherLabId }))).toBe(false)
    expect(ability.can('delete', toRecord('Study', { submittedByOrgId: otherLabId }))).toBe(false)
    expect(ability.can('create', toRecord('StudyJob', { submittedByOrgId: otherLabId }))).toBe(false)

    // Fail-closed so a caller cannot slip past the scope by omitting the field (OTTER-719).
    expect(ability.can('create', toRecord('Study', {}))).toBe(false)

    expect(ability.can('invite', toRecord('User', { orgId: ownLabId }))).toBe(false)
    expect(ability.can('view', 'UserKey')).toBe(true)
    expect(ability.can('update', 'UserKey')).toBe(true)
})

test('manageRole is never granted by the self-update rule (OTTER-720)', () => {
    const { ability, session } = createAbilty({ isAdmin: false })

    expect(ability.can('manageRole', toRecord('User', { id: session.user.id }))).toBe(false)
    expect(ability.can('manageRole', toRecord('User', { orgId: session.orgs.test.id }))).toBe(false)
    expect(ability.can('manageRole', toRecord('User', { id: session.user.id, orgId: session.orgs.test.id }))).toBe(
        false,
    )

    // onUserResetPWAction depends on the self-profile rule surviving.
    expect(ability.can('update', toRecord('User', { id: session.user.id }))).toBe(true)

    expect(ability.can('revoke', toRecord('PendingUser', { orgId: session.orgs.test.id }))).toBe(false)
})

test('org admin holds manageRole and revoke, scoped to their own org (OTTER-720)', () => {
    const { ability, session } = createAbilty({ isAdmin: true })
    const otherOrgId = faker.string.uuid()

    expect(ability.can('manageRole', toRecord('User', { orgId: session.orgs.test.id }))).toBe(true)
    expect(ability.can('manageRole', toRecord('User', { orgId: otherOrgId }))).toBe(false)
    expect(ability.can('manageRole', toRecord('User', {}))).toBe(false)

    expect(ability.can('revoke', toRecord('PendingUser', { orgId: session.orgs.test.id }))).toBe(true)
    expect(ability.can('revoke', toRecord('PendingUser', { orgId: otherOrgId }))).toBe(false)
})

test('load IDE is scoped to the submitting lab (OTTER-719)', () => {
    const { ability, session } = createAbilty({}, 'lab')
    const ownLabId = session.orgs.test.id
    const otherLabId = faker.string.uuid()

    expect(ability.can('load', toRecord('IDE', { submittedByOrgId: ownLabId }))).toBe(true)

    // The defect: the grant was unconditioned, so any studyId gave access to its workspace files.
    expect(ability.can('load', toRecord('IDE', { submittedByOrgId: otherLabId }))).toBe(false)

    expect(ability.can('load', toRecord('IDE', { submittedByOrgId: otherLabId, researcherId: session.user.id }))).toBe(
        true,
    )
    expect(
        ability.can('load', toRecord('IDE', { submittedByOrgId: otherLabId, researcherId: faker.string.uuid() })),
    ).toBe(false)

    expect(ability.can('load', toRecord('IDE', {}))).toBe(false)
})

test('enclave-only members cannot load the IDE (OTTER-719)', () => {
    const { ability } = createAbilty({}, 'enclave')

    expect(ability.can('load', toRecord('IDE', { submittedByOrgId: faker.string.uuid() }))).toBe(false)
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

    expect(ability.can('manageRole', toRecord('User', { orgId: someOrg }))).toBe(true)
    expect(ability.can('revoke', toRecord('PendingUser', { orgId: someOrg }))).toBe(true)
})

test('acknowledging a legal document is bounded by the audience it binds', () => {
    const { ability, session } = createAbilty({}, 'enclave')
    const orgId = session.orgs.test.id
    const otherOrgId = faker.string.uuid()

    expect(ability.can('acknowledge', toRecord('LegalDocument', { isGlobal: true, audienceOrgIds: [] }))).toBe(true)

    expect(ability.can('acknowledge', toRecord('LegalDocument', { isGlobal: false, audienceOrgIds: [orgId] }))).toBe(
        true,
    )
    expect(
        ability.can('acknowledge', toRecord('LegalDocument', { isGlobal: false, audienceOrgIds: [otherOrgId] })),
    ).toBe(false)

    expect(
        ability.can('acknowledge', toRecord('LegalDocument', { isGlobal: false, audienceOrgIds: [otherOrgId, orgId] })),
    ).toBe(true)

    expect(ability.can('acknowledge', toRecord('LegalDocument', { isGlobal: false, audienceOrgIds: [] }))).toBe(false)
})

test('an org admin may read their own legal center, and only their own', () => {
    const { ability, session } = createAbilty({ isAdmin: true }, 'enclave')
    const orgId = session.orgs.test.id
    const otherOrgId = faker.string.uuid()

    expect(ability.can('view', toRecord('OrgLegalDocuments', { orgId }))).toBe(true)
    expect(ability.can('view', toRecord('OrgLegalDocuments', { orgId: otherOrgId }))).toBe(false)

    expect(ability.can('view', toRecord('OrgLegalDocuments', {}))).toBe(false)

    // These SI-admin reads expose unpublished drafts and version history.
    expect(ability.can('view', toRecord('LegalDocument', { orgId }))).toBe(false)
    expect(ability.can('create', toRecord('LegalDocument', { orgId }))).toBe(false)
    expect(ability.can('publish', toRecord('LegalDocument', { orgId }))).toBe(false)
})

test('a plain org member may not read the legal center', () => {
    const { ability, session } = createAbilty({}, 'enclave')

    expect(ability.can('view', toRecord('OrgLegalDocuments', { orgId: session.orgs.test.id }))).toBe(false)
})

test('non-SI-admin is still bounded (manage/all does not leak to regular users)', () => {
    const { ability } = createAbilty({}, 'enclave', { isSiAdmin: false })
    const otherOrgId = faker.string.uuid()

    expect(ability.can('review', toRecord('Study', { orgId: otherOrgId }))).toBe(false)
    expect(ability.can('delete', toRecord('Org', { orgId: otherOrgId }))).toBe(false)
    expect(ability.can('create', 'Org')).toBe(false)
    expect(ability.can('manageRole', toRecord('User', { orgId: otherOrgId }))).toBe(false)
    expect(ability.can('revoke', toRecord('PendingUser', { orgId: otherOrgId }))).toBe(false)
})
