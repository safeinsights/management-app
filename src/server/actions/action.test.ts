import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { Action, ActionFailure } from './action'
import { auth, currentUser, clerkClient } from '@clerk/nextjs/server'
import { getOrgInfoForUserId } from '../db/queries'

vi.mock('@/server/db/queries', () => ({
    getOrgInfoForUserId: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(),
    currentUser: vi.fn(),
    clerkClient: vi.fn(() => ({
        users: {
            getUser: vi.fn().mockResolvedValue({
                id: 'user_123',
                publicMetadata: {},
            }),
            updateUserMetadata: vi.fn(),
        },
    })),
}))

describe('Action Builder', () => {
    beforeEach(() => {
        vi.mocked(auth).mockResolvedValue({
            userId: 'user_123',
            sessionClaims: {
                jti: 'jwt_123',
            },
        } as any)
        vi.mocked(currentUser).mockResolvedValue({
            id: 'user_123',
        } as any)
        vi.mocked(getOrgInfoForUserId).mockResolvedValue([
            {
                id: 'org_123',
                slug: 'test-org',
                isAdmin: true,
                isResearcher: true,
                isReviewer: true,
            },
        ])
    })
    describe('action without schema', () => {
        it('creates an action that accepts no arguments', async () => {
            const mockHandler = vi.fn().mockResolvedValue('success')

            const action = new Action('test-action').handler(mockHandler)

            const result = await action(undefined)

            expect(result).toBe('success')
            expect(mockHandler).toHaveBeenCalledWith(undefined, expect.any(Object))
        })

        it('handles null input correctly', async () => {
            const mockHandler = vi.fn().mockResolvedValue('handled')

            const action = new Action('null-test').handler(mockHandler)

            const result = await action(null)

            expect(result).toBe('handled')
            expect(mockHandler).toHaveBeenCalledWith(null, expect.any(Object))
        })

        it('can be called without any arguments when no schema is defined', async () => {
            const mockHandler = vi.fn().mockResolvedValue('no-args')

            const action = new Action('no-args-test').handler(mockHandler)

            const result = await action(undefined)

            expect(result).toBe('no-args')
            expect(mockHandler).toHaveBeenCalledWith(undefined, expect.any(Object))
        })
    })

    describe('action with schema validation', () => {
        it('validates input against provided schema', async () => {
            const schema = z.object({
                name: z.string(),
                age: z.number(),
            })

            const mockHandler = vi.fn().mockResolvedValue('validated')

            const action = new Action('schema-test').params(schema).handler(mockHandler)

            const input = { name: 'John', age: 30 }
            const result = await action(input)

            expect(result).toBe('validated')
            expect(mockHandler).toHaveBeenCalledWith(input, expect.any(Object))
        })

        it('throws error for invalid input', async () => {
            const schema = z.object({
                name: z.string(),
                age: z.number(),
            })

            const mockHandler = vi.fn()

            const action = new Action('invalid-test').params(schema).handler(mockHandler)

            const invalidInput = { name: 'John', age: 'thirty' }

            await expect(action(invalidInput)).rejects.toThrow(ActionFailure)
            expect(mockHandler).not.toHaveBeenCalled()
        })
    })

    describe('middleware functionality', () => {
        it('runs middleware and merges context', async () => {
            const middleware1 = vi.fn().mockResolvedValue({ user: 'john' })
            const middleware2 = vi.fn().mockResolvedValue({ timestamp: '2023-01-01' })
            const mockHandler = vi.fn().mockResolvedValue('success')

            const action = new Action('middleware-test')
                .middleware(middleware1)
                .middleware(middleware2)
                .handler(mockHandler)

            const result = await action(undefined)

            expect(result).toBe('success')
            expect(middleware1).toHaveBeenCalledWith(undefined, expect.any(Object))
            expect(middleware2).toHaveBeenCalledWith(undefined, expect.objectContaining({ user: 'john' }))
            expect(mockHandler).toHaveBeenCalledWith(
                undefined,
                expect.objectContaining({
                    user: 'john',
                    timestamp: '2023-01-01',
                }),
            )
        })

        it('preserves middleware execution order', async () => {
            const executionOrder: string[] = []

            const middleware1 = vi.fn().mockImplementation(async () => {
                executionOrder.push('middleware1')
                return { step: 1 }
            })

            const middleware2 = vi.fn().mockImplementation(async () => {
                executionOrder.push('middleware2')
                return { step: 2 }
            })

            const mockHandler = vi.fn().mockImplementation(async () => {
                executionOrder.push('handler')
                return 'done'
            })

            const action = new Action('order-test').middleware(middleware1).middleware(middleware2).handler(mockHandler)

            await action(undefined)

            expect(executionOrder).toEqual(['middleware1', 'middleware2', 'handler'])
        })
    })

    describe('combined functionality', () => {
        it('works with schema, middleware, and handler together', async () => {
            const schema = z.object({ userId: z.string() })
            const middleware = vi.fn().mockResolvedValue({ authenticated: true })
            const mockHandler = vi.fn().mockResolvedValue('complete')

            const action = new Action('combined-test').params(schema).middleware(middleware).handler(mockHandler)

            const input = { userId: 'user123' }
            const result = await action(input)

            expect(result).toBe('complete')
            expect(middleware).toHaveBeenCalledWith(input, expect.any(Object))
            expect(mockHandler).toHaveBeenCalledWith(input, expect.objectContaining({ authenticated: true }))
        })
    })
})
