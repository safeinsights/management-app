import { describe, it, expect, vi, Mock } from 'vitest'
import { z } from 'zod'
import { auth as clerkAuth } from '@clerk/nextjs/server'
import {
    actionContext,
    getUserIdFromActionContext,
    getOrgInfoFromActionContext,
    anonAction,
    userAction,
    adminAction,
    researcherAction,
    orgAction,
    orgAdminAction,
    checkMemberOfOrgWithSlug,
    localStorageContext,
} from './wrappers'
import { db } from '@/database'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { AccessDeniedError } from '@/lib/errors'
import { mockSessionWithTestData } from '@/tests/unit.helpers'

const clerkAuthMock = clerkAuth as unknown as Mock

describe('anonAction()', () => {
    it('calls through when no schema is provided', async () => {
        const func = vi.fn().mockResolvedValue('OK')
        const wrapped = anonAction(func)
        await expect(wrapped({ foo: 'bar' })).resolves.toBe('OK')
        expect(func).toHaveBeenCalledWith({ foo: 'bar' })
    })

    it('validates args against schema and rejects invalid', async () => {
        const schema = z.object({ x: z.number() })
        const func = vi.fn().mockResolvedValue('OK')
        const wrapped = anonAction(func, schema)
        await expect(wrapped({ x: 123 })).resolves.toBe('OK')
        await expect(wrapped({ x: 'nope' })).rejects.toThrow()
    })
})

describe('actionContext & simple getters', () => {
    it('returns a fresh ctx when none is set', async () => {
        const { org, user } = await mockSessionWithTestData()
        const ctx = await actionContext()
        expect(ctx.user.id).toBe(user.id)
        expect(ctx.org).toEqual({ slug: org.slug })
    })

    it('getUserIdFromActionContext() returns the same userId', async () => {
        const { user } = await mockSessionWithTestData()
        await expect(getUserIdFromActionContext()).resolves.toBe(user.id)
    })

    it('getOrgInfoFromActionContext() throws when no org', async () => {
        const { user } = await mockSessionWithTestData()
        await localStorageContext.run(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { user: user as any, org: {} },
            async () => {
                await expect(getOrgInfoFromActionContext()).rejects.toThrow('user is not a member of organization?')
            },
        )
    })

    it('getOrgInfoFromActionContext(false) returns partial org', async () => {
        const { user, orgUser } = await mockSessionWithTestData()
        await localStorageContext.run(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { user: user as any, org: orgUser as any },
            async () => {
                await expect(getOrgInfoFromActionContext(false)).resolves.toEqual(orgUser)
            },
        )
    })
})

describe('userAction()', () => {
    it('runs inner func with AsyncLocalStorage populated', async () => {
        const { user } = await mockSessionWithTestData()
        const fn = vi.fn().mockImplementation(async () => {
            return localStorageContext.getStore()
        })
        const wrapped = userAction(fn)
        const store = await wrapped({})
        expect(store).toMatchObject({
            user: expect.objectContaining({ id: user.id }),
            org: {},
        })
    })
})

describe('adminAction()', () => {
    it('allows when orgSlug === CLERK_ADMIN_ORG_SLUG', async () => {
        await mockSessionWithTestData()
        clerkAuthMock.mockResolvedValue({ orgSlug: CLERK_ADMIN_ORG_SLUG })
        const fn = vi.fn().mockResolvedValue('ADM_OK')
        const wrapped = adminAction(fn)
        await expect(wrapped({})).resolves.toBe('ADM_OK')
    })

    it('throws AccessDeniedError when not admin org', async () => {
        const wrapped = adminAction(vi.fn())
        await expect(wrapped({})).rejects.toBeInstanceOf(AccessDeniedError)
    })
})

describe('researcherAction()', () => {
    it('allows when user.isResearcher === true', async () => {
        const { orgUser } = await mockSessionWithTestData()
        await db.updateTable('orgUser').set({ isResearcher: true }).where('id', '=', orgUser.id).execute()
        const fn = vi.fn().mockResolvedValue('RES_OK')
        const wrapped = researcherAction(fn)
        await expect(wrapped({})).resolves.toBe('RES_OK')
    })

    it('throws when user.isResearcher === false', async () => {
        const { orgUser } = await mockSessionWithTestData()
        await db.updateTable('orgUser').set({ isResearcher: false }).where('id', '=', orgUser.id).execute()

        const wrapped = researcherAction(vi.fn())
        await expect(wrapped({})).rejects.toBeInstanceOf(AccessDeniedError)
    })

    it('checks orgSlug if given', async () => {
        const { orgUser } = await mockSessionWithTestData()
        await db.updateTable('orgUser').set({ isResearcher: true }).where('id', '=', orgUser.id).execute()

        const wrapped = researcherAction(vi.fn())
        await expect(wrapped({ orgSlug: 'not-valid' })).rejects.toBeInstanceOf(AccessDeniedError)
    })
})

describe('orgAction()', () => {
    const schema = z.object({ orgSlug: z.string() })

    it('throws if arg.orgSlug is missing', async () => {
        const wrapped = orgAction(vi.fn(), schema)
        await expect(wrapped({})).rejects.toBeInstanceOf(AccessDeniedError)
    })

    it('throws if user is not a member', async () => {
        const { orgUser } = await mockSessionWithTestData()
        await db.deleteFrom('orgUser').where('id', '=', orgUser.id).execute()
        const wrapped = orgAction(vi.fn(), schema)
        await expect(wrapped({ orgSlug: 'nope' })).rejects.toBeInstanceOf(AccessDeniedError)
    })

    it('succeeds and injects ctx.org when member exists', async () => {
        const { org, orgUser } = await mockSessionWithTestData()
        await db
            .updateTable('orgUser')
            .set({ isResearcher: false, isReviewer: true, isAdmin: true })
            .where('id', '=', orgUser.id)
            .execute()

        const fn = vi.fn().mockImplementation(async () => localStorageContext.getStore())
        const wrapped = orgAction(fn, schema)
        const store = await wrapped({ orgSlug: org.slug })
        expect(store.org).toMatchObject({
            id: org.id,
            slug: org.slug,
            isReviewer: true,
            isResearcher: false,
            isAdmin: true,
        })
    })
})

describe('orgAdminAction()', () => {
    const schema = z.object({ orgSlug: z.string() })

    it('throws if user is not org-admin after orgAction', async () => {
        const { orgUser, org } = await mockSessionWithTestData()
        await db.updateTable('orgUser').set({ isAdmin: false }).where('id', '=', orgUser.id).execute()

        const wrapped = orgAdminAction(vi.fn(), schema)
        await expect(wrapped({ orgSlug: org.slug })).rejects.toBeInstanceOf(AccessDeniedError)
    })

    it('allows when user is org-admin', async () => {
        const { org, orgUser } = await mockSessionWithTestData()
        await db.updateTable('orgUser').set({ isAdmin: true }).where('id', '=', orgUser.id).execute()

        const fn = vi.fn().mockResolvedValue('OKAY')
        const wrapped = orgAdminAction(fn, schema)
        await expect(wrapped({ orgSlug: org.slug })).resolves.toBe('OKAY')
    })
})

describe('checkMemberOfOrgWithSlug()', () => {
    it('returns true if slug matches ctx.org.slug', async () => {
        const { org, user } = await mockSessionWithTestData()
        await localStorageContext.run(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { user: user as any, org: { slug: org.slug } },
            async () => {
                await expect(checkMemberOfOrgWithSlug(org.slug)).resolves.toBe(true)
            },
        )
    })

    it('throws if slug does not match', async () => {
        await mockSessionWithTestData()

        localStorageContext.run(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { user: { id: 'u11' } as any, org: { slug: 'aaa' } },
            async () => {
                await expect(checkMemberOfOrgWithSlug('bbb')).rejects.toBeInstanceOf(AccessDeniedError)
            },
        )
    })
})
