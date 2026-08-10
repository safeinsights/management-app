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

test('reviewer cannot view unsubmitted drafts, but can view submitted studies (OTTER-596)', () => {
    const { ability, session } = createAbilty({}, 'enclave')
    const orgId = session.orgs.test.id

    // Data Organization (enclave reviewer) must NOT see an unsubmitted draft, even with the org id
    const draft: StudyStatus = 'DRAFT'
    expect(ability.can('view', toRecord('Study', { orgId, status: draft }))).toBe(false)
    expect(ability.can('view', toRecord('StudyJob', { orgId, status: draft }))).toBe(false)

    // ...but keeps access to every submitted status (incl. CHANGE-REQUESTED resubmissions)
    const submitted: StudyStatus[] = ['PENDING-REVIEW', 'CHANGE-REQUESTED', 'APPROVED', 'REJECTED', 'ARCHIVED']
    for (const status of submitted) {
        expect(ability.can('view', toRecord('Study', { orgId, status }))).toBe(true)
        expect(ability.can('view', toRecord('StudyJob', { orgId, status }))).toBe(true)
    }

    // Fail-closed: a subject that omits status is denied rather than silently granted
    expect(ability.can('view', toRecord('Study', { orgId }))).toBe(false)
    expect(ability.can('view', toRecord('StudyJob', { orgId }))).toBe(false)
})

test('lab members can still view their own lab drafts (OTTER-596 regression guard)', () => {
    const { ability, session } = createAbilty({}, 'lab')
    const submittedByOrgId = session.orgs.test.id
    const otherLabId = faker.string.uuid()
    const draft: StudyStatus = 'DRAFT'

    // The submitting Research Lab retains full draft access via the submittedByOrgId rule
    expect(ability.can('view', toRecord('Study', { submittedByOrgId, status: draft }))).toBe(true)
    expect(ability.can('view', toRecord('StudyJob', { submittedByOrgId, status: draft }))).toBe(true)

    // ...but not another lab's draft
    expect(ability.can('view', toRecord('Study', { submittedByOrgId: otherLabId, status: draft }))).toBe(false)
})

test('researcher role', () => {
    const { ability, session } = createAbilty({}, 'lab')
    const ownLabId = session.orgs.test.id
    const otherLabId = faker.string.uuid()

    expect(
        // researchers cannot approve studies
        ability.can('approve', toRecord('Study', { orgId: ownLabId })),
    ).toBe(false)

    // create/update/delete are scoped to studies the researcher's own lab submitted
    expect(ability.can('create', toRecord('Study', { submittedByOrgId: ownLabId }))).toBe(true)
    expect(ability.can('update', toRecord('Study', { submittedByOrgId: ownLabId }))).toBe(true)
    expect(ability.can('delete', toRecord('Study', { submittedByOrgId: ownLabId }))).toBe(true)
    expect(ability.can('create', toRecord('StudyJob', { submittedByOrgId: ownLabId }))).toBe(true)

    // ...but not studies submitted by a different lab
    expect(ability.can('create', toRecord('Study', { submittedByOrgId: otherLabId }))).toBe(false)
    expect(ability.can('update', toRecord('Study', { submittedByOrgId: otherLabId }))).toBe(false)
    expect(ability.can('delete', toRecord('Study', { submittedByOrgId: otherLabId }))).toBe(false)
    expect(ability.can('create', toRecord('StudyJob', { submittedByOrgId: otherLabId }))).toBe(false)

    // Fail-closed: creating with no submitting lab in the subject is denied, so a caller cannot
    // slip past the scope by omitting the field (OTTER-719).
    expect(ability.can('create', toRecord('Study', {}))).toBe(false)

    // Researchers cannot invite users to their org (not admins)
    expect(ability.can('invite', toRecord('User', { orgId: ownLabId }))).toBe(false)

    // lab members also hold a key now, to decrypt approved results
    expect(ability.can('view', 'UserKey')).toBe(true)
    expect(ability.can('update', 'UserKey')).toBe(true)
})

test('manageRole is never granted by the self-update rule (OTTER-720)', () => {
    const { ability, session } = createAbilty({ isAdmin: false })

    // The defect: role changes were gated on `update User`, which every user holds for their own
    // id, so passing your own userId satisfied the check and promoted you to admin.
    expect(ability.can('manageRole', toRecord('User', { id: session.user.id }))).toBe(false)
    expect(ability.can('manageRole', toRecord('User', { orgId: session.orgs.test.id }))).toBe(false)
    expect(ability.can('manageRole', toRecord('User', { id: session.user.id, orgId: session.orgs.test.id }))).toBe(
        false,
    )

    // The self-profile rule itself must survive — onUserResetPWAction depends on it.
    expect(ability.can('update', toRecord('User', { id: session.user.id }))).toBe(true)

    // Revoking an invite is likewise admin-only now.
    expect(ability.can('revoke', toRecord('PendingUser', { orgId: session.orgs.test.id }))).toBe(false)
})

test('org admin holds manageRole and revoke, scoped to their own org (OTTER-720)', () => {
    const { ability, session } = createAbilty({ isAdmin: true })
    const otherOrgId = faker.string.uuid()

    expect(ability.can('manageRole', toRecord('User', { orgId: session.orgs.test.id }))).toBe(true)
    expect(ability.can('manageRole', toRecord('User', { orgId: otherOrgId }))).toBe(false)
    // Fail-closed when the subject carries no orgId at all.
    expect(ability.can('manageRole', toRecord('User', {}))).toBe(false)

    expect(ability.can('revoke', toRecord('PendingUser', { orgId: session.orgs.test.id }))).toBe(true)
    expect(ability.can('revoke', toRecord('PendingUser', { orgId: otherOrgId }))).toBe(false)
})

test('load IDE is scoped to the submitting lab (OTTER-719)', () => {
    const { ability, session } = createAbilty({}, 'lab')
    const ownLabId = session.orgs.test.id
    const otherLabId = faker.string.uuid()

    // A lab member reaches the IDE for a study their own lab submitted...
    expect(ability.can('load', toRecord('IDE', { submittedByOrgId: ownLabId }))).toBe(true)

    // ...but not another lab's study. This was the defect: the grant was unconditioned, so supplying
    // any studyId gave read/write/delete on that study's workspace files.
    expect(ability.can('load', toRecord('IDE', { submittedByOrgId: otherLabId }))).toBe(false)

    // The study's own researcher keeps access regardless of which lab submitted it.
    expect(ability.can('load', toRecord('IDE', { submittedByOrgId: otherLabId, researcherId: session.user.id }))).toBe(
        true,
    )
    expect(
        ability.can('load', toRecord('IDE', { submittedByOrgId: otherLabId, researcherId: faker.string.uuid() })),
    ).toBe(false)

    // Fail-closed: a subject missing submittedByOrgId is denied rather than silently granted
    expect(ability.can('load', toRecord('IDE', {}))).toBe(false)
})

test('enclave-only members cannot load the IDE (OTTER-719)', () => {
    // The scoped grant lives behind `if (usersResearcherOrgIds.length)`, so a user with no lab
    // membership never receives it.
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

    // The wildcard covers the OTTER-720 verbs too, for orgs the SI admin does not belong to —
    // they are deliberately absent from the enumerated admin grants.
    expect(ability.can('manageRole', toRecord('User', { orgId: someOrg }))).toBe(true)
    expect(ability.can('revoke', toRecord('PendingUser', { orgId: someOrg }))).toBe(true)
})

test('non-SI-admin is still bounded (manage/all does not leak to regular users)', () => {
    // Guards the wildcard: a plain enclave reviewer must NOT gain blanket permission.
    const { ability } = createAbilty({}, 'enclave', { isSiAdmin: false })
    const otherOrgId = faker.string.uuid()

    expect(ability.can('review', toRecord('Study', { orgId: otherOrgId }))).toBe(false)
    expect(ability.can('delete', toRecord('Org', { orgId: otherOrgId }))).toBe(false)
    expect(ability.can('create', 'Org')).toBe(false)
    expect(ability.can('manageRole', toRecord('User', { orgId: otherOrgId }))).toBe(false)
    expect(ability.can('revoke', toRecord('PendingUser', { orgId: otherOrgId }))).toBe(false)
})
