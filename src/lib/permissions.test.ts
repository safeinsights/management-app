import { test, expect } from 'vitest'

import type { UserSession, UserOrgRoles } from './types'
import { faker } from '@faker-js/faker'
import { subject } from '@casl/ability'
import { defineAbilityFor } from './permissions'
import { StudyStatus } from '@/database/types'

const createAbilty = (roles: Partial<UserOrgRoles> = {}) => {
    const session: UserSession = {
        user: {
            id: faker.string.uuid(),
            clerkUserId: faker.string.alpha(),
            isSiAdmin: false,
        },
        team: {
            id: faker.string.uuid(),
            slug: 'test',
            isAdmin: false,
            isResearcher: false,
            isReviewer: false,
            ...roles,
        },
    }
    return { ability: defineAbilityFor(session), session }
}

test('reviewer role', () => {
    const { ability, session } = createAbilty({ isReviewer: true })
    expect(
        // general form, yes researcher can approve studies
        ability.can('approve', 'Study'),
    ).toBeTruthy()

    expect(
        ability.can('approve', subject('Study', { orgId: '123', status: 'PENDING-REVIEW' as StudyStatus })),
    ).toBeTruthy()

    expect(ability.can('invite', 'User')).toBe(false)

    expect(ability.can('update', subject('User', session.user))).toBe(true)

    expect(ability.can('update', subject('User', { id: faker.string.uuid() }))).toBe(false)
})

test('researcher role', () => {
    const { ability } = createAbilty({ isResearcher: true })

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

    expect(
        ability.can('approve', subject('Study', { orgId: '123', status: 'PENDING-REVIEW' as StudyStatus })),
    ).toBeTruthy()

    expect(ability.can('invite', 'User')).toBe(true)

    expect(ability.can('update', subject('User', { user: { orgId: session.team.id } }))).toBe(true)

    expect(ability.can('update', subject('User', { id: faker.string.uuid(), orgId: faker.string.uuid() }))).toBe(false)
})
