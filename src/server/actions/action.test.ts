import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { actionResponseIsError } from '@/hooks/query-wrappers'
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
            const result = await action(invalidInput as any)
            expect(result).toEqual({ error: expect.stringContaining('Validation error') })
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

    describe('error handling', () => {
        it('catches exceptions and returns them as error objects', async () => {
            const errorMessage = 'Something went wrong'
            const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage))

            const action = new Action('error-test').handler(mockHandler)

            const result = await action()

            expect(result).toEqual({ error: errorMessage })
            expect(mockHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: undefined,
                    session: expect.any(Object),
                    db: expect.any(Object),
                }),
            )
        })

        it('catches ActionFailure exceptions with string errors and returns them as error objects', async () => {
            const failureMessage = 'Action failed'
            const mockHandler = vi.fn().mockImplementation(() => {
                throw new ActionFailure(failureMessage)
            })

            const action = new Action('action-failure-test').handler(mockHandler)

            const result = await action()

            expect(result).toEqual({ error: failureMessage })
        })

        it('catches ActionFailure exceptions with object errors and returns them as error objects', async () => {
            const failureObject = { field1: 'Error message 1', field2: 'Error message 2' }
            const mockHandler = vi.fn().mockImplementation(() => {
                throw new ActionFailure(failureObject)
            })

            const action = new Action('action-failure-object-test').handler(mockHandler)

            const result = await action()

            expect(result).toEqual({ error: failureObject })
        })

        it('catches handler exceptions and returns them as error objects', async () => {
            const mockHandler = vi.fn(async () => {
                if (1) throw new Error('hi')
                return { foo: 'bar' }
            })

            const action = new Action('middleware-error-test').handler(mockHandler)

            const result = await action()
            if (!actionResponseIsError(result)) {
                expect(result.foo).toBe('bar')
            }

            expect(result).toEqual({ error: 'hi' })
        })
    })
})
