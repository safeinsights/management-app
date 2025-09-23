import { test, expect } from 'vitest'

import type { UserSession, UserOrgRoles } from './types'
import { faker } from '@faker-js/faker'
import { defineAbilityFor, toRecord } from './permissions'

const createAbilty = (roles: Partial<UserOrgRoles> = {}, orgType: 'enclave' | 'lab' = 'enclave') => {
    const session: UserSession = {
        user: {
            id: faker.string.uuid(),
            clerkUserId: faker.string.alpha(),
            isSiAdmin: false,
        },
        org: {
            id: faker.string.uuid(),
            type: orgType,
            slug: 'test',
            isAdmin: false,
            ...roles,
        },
    }
    return { ability: defineAbilityFor(session), session }
}

test('reviewer role', () => {
    const { ability, session } = createAbilty({}, 'enclave')
    expect(
        // general form, yes reviewer can approve studies
        ability.can('approve', 'Study'),
    ).toBeTruthy()

    expect(ability.can('update', toRecord('Study', { orgId: session.org.id }))).toBeFalsy()
    expect(ability.can('invite', 'User')).toBe(false)
    expect(ability.can('update', toRecord('User', { id: session.user.id }))).toBe(true)
    expect(ability.can('update', toRecord('User', { id: faker.string.uuid() }))).toBe(false)
})

test('researcher role', () => {
    const { ability } = createAbilty({}, 'lab')

    expect(
        // n.b. using cannot
        ability.cannot('approve', 'Study'),
    ).toBe(true)

    expect(ability.can('create', 'Study')).toBe(true)

    expect(ability.can('invite', 'User')).toBe(false)
})

test('admin role', () => {
    const { ability, session } = createAbilty({ isAdmin: true })
    expect(ability.can('approve', 'Study')).toBeTruthy()
    expect(ability.can('approve', toRecord('Study', { orgId: session.org.id }))).toBeTruthy()
    expect(ability.can('invite', toRecord('User', { orgId: session.org.id }))).toBe(true)
    expect(ability.can('update', toRecord('User', { orgId: session.org.id }))).toBe(true)
    expect(ability.can('update', toRecord('User', { id: faker.string.uuid(), orgId: faker.string.uuid() }))).toBe(false)
})
