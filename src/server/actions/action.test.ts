import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { Action, ActionFailure } from './action'
import { mockSessionWithTestData } from '@/tests/unit.helpers'

describe('Action Builder', () => {
    beforeEach(async () => {
        await mockSessionWithTestData()
    })

    describe('action without schema', () => {
        it('creates an action that accepts no arguments', async () => {
            const mockHandler = vi.fn().mockResolvedValue('success')

            const action = new Action('test-action').handler(mockHandler)

            const result = await action()

            expect(result).toBe('success')
            expect(mockHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: undefined,
                    session: expect.any(Object),
                    db: expect.any(Object),
                }),
            )
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
            expect(mockHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: input,
                    session: expect.any(Object),
                    db: expect.any(Object),
                }),
            )
        })

        it('throws error for invalid input', async () => {
            const schema = z.object({
                name: z.string(),
                age: z.number(),
            })

            const mockHandler = vi.fn()

            const action = new Action('invalid-test').params(schema).handler(mockHandler)

            const invalidInput = { name: 'John', age: 'thirty' }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await expect(action(invalidInput as any)).rejects.toThrow(ActionFailure)
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

            const result = await action()

            expect(result).toBe('success')
            expect(middleware1).toHaveBeenCalledWith(expect.any(Object))
            expect(middleware2).toHaveBeenCalledWith(expect.objectContaining({ user: 'john' }))
            expect(mockHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: undefined,
                    user: 'john',
                    timestamp: '2023-01-01',
                    session: expect.any(Object),
                    db: expect.any(Object),
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

            await action()

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
            expect(middleware).toHaveBeenCalledWith(expect.objectContaining({ params: input }))
            expect(mockHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: input,
                    authenticated: true,
                    session: expect.any(Object),
                    db: expect.any(Object),
                }),
            )
        })
    })
})
