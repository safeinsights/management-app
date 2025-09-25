import { test, expect } from 'vitest'

import type { UserSession, UserOrgRoles } from './types'
import { faker } from '@faker-js/faker'
import { defineAbilityFor, toRecord } from './permissions'

const createAbilty = (roles: Partial<UserOrgRoles> = {}, orgType: 'enclave' | 'lab' = 'enclave') => {
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
            isSiAdmin: false,
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
})

test('researcher role', () => {
    const { ability, session } = createAbilty({}, 'lab')

    expect(
        // researchers cannot approve studies
        ability.can('approve', toRecord('Study', { orgId: session.orgs.test.id })),
    ).toBe(false)

    expect(ability.can('create', 'Study')).toBe(true)

    // Researchers cannot invite users to their org (not admins)
    expect(ability.can('invite', toRecord('User', { orgId: session.orgs.test.id }))).toBe(false)
})

test('admin role', () => {
    const { ability, session } = createAbilty({ isAdmin: true })
    expect(ability.can('approve', 'Study')).toBeTruthy()
    expect(ability.can('approve', toRecord('Study', { orgId: session.orgs.test.id }))).toBeTruthy()
    expect(ability.can('invite', toRecord('User', { orgId: session.orgs.test.id }))).toBe(true)
    expect(ability.can('update', toRecord('User', { orgId: session.orgs.test.id }))).toBe(true)
    expect(ability.can('update', toRecord('User', { id: faker.string.uuid(), orgId: faker.string.uuid() }))).toBe(false)
})
