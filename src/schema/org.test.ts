import { describe, it, expect, NFD_E_ACUTE } from '@/tests/unit.helpers'
import { orgSchema } from '@/schema/org'

const validOrg = (overrides: { name?: string; description?: string }) => ({
    slug: 'test-org',
    name: 'Test Org',
    email: 'org@example.com',
    type: 'lab' as const,
    settings: {},
    ...overrides,
})

describe('orgSchema limits counted like the on-screen counter', () => {
    it('accepts a name and description exactly at their limits', () => {
        const result = orgSchema.safeParse(
            validOrg({ name: NFD_E_ACUTE.repeat(50), description: NFD_E_ACUTE.repeat(250) }),
        )

        expect(result.success).toBe(true)
    })

    it('rejects a name one character over the limit', () => {
        const result = orgSchema.safeParse(validOrg({ name: NFD_E_ACUTE.repeat(51) }))

        expect(result.error?.issues.map((i) => i.message)).toEqual(['Name cannot exceed 50 characters'])
    })

    it('rejects a description one character over the limit', () => {
        const result = orgSchema.safeParse(validOrg({ description: NFD_E_ACUTE.repeat(251) }))

        expect(result.error?.issues.map((i) => i.message)).toEqual(['Description cannot exceed 250 characters'])
    })
})
