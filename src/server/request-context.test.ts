import { AsyncResource } from 'node:async_hooks'
import { AccessDeniedError } from '@/lib/errors'
import { Action } from '@/server/actions/action'
import { deferred } from '@/server/events'
import {
    apiRequestingOrg,
    currentDb,
    localStorageContext,
    wasCalledFromAPI,
    withTransaction,
} from '@/server/request-context'
import {
    db,
    describe,
    expect,
    faker,
    flushDeferred,
    insertTestOrg,
    it,
    mockSessionWithTestData,
    vi,
} from '@/tests/unit.helpers'

const captureAfterCommit = () => AsyncResource.bind(() => localStorageContext.getStore()?.afterCommit)
const queueAfterCommit = (hook: () => Promise<unknown>) => localStorageContext.getStore()?.afterCommit?.(hook)

describe('currentDb', () => {
    it('is the root connection outside any store', () => {
        expect(currentDb()).toBe(db)
        expect(currentDb().isTransaction).toBe(false)
    })
})

describe('withTransaction', () => {
    it('binds currentDb() to the transaction it opens', async () => {
        await withTransaction(currentDb(), async (trx) => {
            expect(currentDb()).toBe(trx)
            expect(currentDb().isTransaction).toBe(true)
        })
    })

    it('refuses a transaction that is not bound to the store', async () => {
        const fn = vi.fn(async () => undefined)
        await expect(db.transaction().execute((trx) => withTransaction(trx, fn))).rejects.toThrow(
            'this transaction is not bound here; pass currentDb()',
        )
        expect(fn).not.toHaveBeenCalled()
    })

    it('joins the ambient transaction', async () => {
        await db.transaction().execute(async (trx) => {
            await localStorageContext.run({ db: trx }, () =>
                withTransaction(trx, async () => {
                    expect(currentDb()).toBe(trx)
                }),
            )
        })
    })

    it('rolls back writes made through currentDb() when fn throws', async () => {
        const slug = faker.string.alpha(12)
        await expect(
            withTransaction(currentDb(), async () => {
                await currentDb()
                    .insertInto('org')
                    .values({ slug, name: 'rolled back', email: `${slug}@example.com`, type: 'lab', settings: {} })
                    .execute()
                throw new Error('inner')
            }),
        ).rejects.toThrow('inner')

        expect(await db.selectFrom('org').select('id').where('slug', '=', slug).executeTakeFirst()).toBeUndefined()
    })

    it('keeps the api org of the enclosing store', async () => {
        const org = await insertTestOrg()
        await localStorageContext.run({ org }, () =>
            withTransaction(currentDb(), async () => {
                expect(apiRequestingOrg()).toBe(org)
            }),
        )
    })

    describe('captured async context', () => {
        it('sees the root once an owned transaction commits', async () => {
            let later = () => currentDb()
            await withTransaction(currentDb(), async () => {
                later = AsyncResource.bind(() => currentDb())
            })
            expect(later().isTransaction).toBe(false)
        })

        it('sees the root once an owned transaction rolls back', async () => {
            let later = () => currentDb()
            await expect(
                withTransaction(currentDb(), async () => {
                    later = AsyncResource.bind(() => currentDb())
                    throw new Error('inner')
                }),
            ).rejects.toThrow('inner')
            expect(later().isTransaction).toBe(false)
        })

        it('gets the enclosing afterCommit back once the transaction ends', async () => {
            const outerSpy = vi.fn()
            let later = captureAfterCommit()

            await localStorageContext.run({ afterCommit: outerSpy }, () =>
                withTransaction(currentDb(), async () => {
                    later = captureAfterCommit()
                }),
            )

            expect(later()).toBe(outerSpy)
        })

        it('has no afterCommit once the transaction ends without an enclosing store', async () => {
            let later = captureAfterCommit()
            await withTransaction(currentDb(), async () => {
                later = captureAfterCommit()
            })
            expect(later()).toBeUndefined()
        })
    })

    describe('owned afterCommit queue', () => {
        it('runs queued hooks after the commit, on the root connection', async () => {
            let sawTransaction: boolean | undefined
            const hook = vi.fn(async () => {
                sawTransaction = currentDb().isTransaction
            })

            await withTransaction(currentDb(), async () => {
                queueAfterCommit(hook)
                expect(hook).not.toHaveBeenCalled()
            })

            expect(hook).toHaveBeenCalledOnce()
            expect(sawTransaction).toBe(false)
        })

        it('drops queued hooks on rollback', async () => {
            const hook = vi.fn(async () => undefined)
            await expect(
                withTransaction(currentDb(), async () => {
                    queueAfterCommit(hook)
                    throw new Error('inner')
                }),
            ).rejects.toThrow('inner')
            expect(hook).not.toHaveBeenCalled()
        })

        it('does not hand its hooks to the enclosing queue', async () => {
            const outerSpy = vi.fn()
            const hook = vi.fn(async () => undefined)
            await localStorageContext.run({ afterCommit: outerSpy }, () =>
                withTransaction(currentDb(), async () => {
                    queueAfterCommit(hook)
                }),
            )
            expect(hook).toHaveBeenCalledOnce()
            expect(outerSpy).not.toHaveBeenCalled()
        })

        it('does not fail when a hook throws, and still runs the hooks after it', async () => {
            const laterHook = vi.fn(async () => undefined)
            const result = await withTransaction(currentDb(), async () => {
                queueAfterCommit(async () => {
                    throw new Error('hook failed')
                })
                queueAfterCommit(laterHook)
                return 'committed'
            })
            expect(result).toBe('committed')
            expect(laterHook).toHaveBeenCalledOnce()
        })
    })

    describe('deferred events', () => {
        it('drops an event fired inside a transaction that rolled back, even when the action succeeds', async () => {
            await mockSessionWithTestData()
            const handler = vi.fn(async () => undefined)
            const event = deferred(handler)
            const action = new Action('inner-rollback').handler(async ({ db }) => {
                await withTransaction(db, async () => {
                    event()
                    throw new Error('inner')
                }).catch(() => undefined)
                return 'ok'
            })

            expect(await action()).toBe('ok')
            await flushDeferred()
            expect(handler).not.toHaveBeenCalled()
        })

        it('runs an event fired inside a committed transaction, even when the action fails', async () => {
            await mockSessionWithTestData()
            const handler = vi.fn(async () => undefined)
            const event = deferred(handler)
            const action = new Action('inner-commit').handler(async ({ db }) => {
                await withTransaction(db, async () => {
                    event()
                })
                throw new Error('outer')
            })

            expect(await action()).toEqual({ error: 'outer' })
            await flushDeferred()
            expect(handler).toHaveBeenCalledOnce()
        })

        it("runs a mutating action's event in the action's store, settled back to the root", async () => {
            await mockSessionWithTestData()
            const seen = vi.fn()
            const event = deferred(async () => {
                seen(currentDb().isTransaction, Boolean(localStorageContext.getStore()?.session))
            })
            const action = new Action('settled-event', { performsMutations: true }).handler(async () => event())

            await action()
            await flushDeferred()
            expect(seen).toHaveBeenCalledWith(false, true)
        })
    })

    describe('when a transaction is already ambient', () => {
        const alreadyOpen = 'a transaction is already open here; pass currentDb() so this work joins it'

        it('refuses to open a second transaction on the root', async () => {
            const fn = vi.fn(async () => undefined)
            await expect(
                db.transaction().execute((trx) => localStorageContext.run({ db: trx }, () => withTransaction(db, fn))),
            ).rejects.toThrow(alreadyOpen)
            expect(fn).not.toHaveBeenCalled()
        })

        it('refuses a transaction other than the ambient one', async () => {
            const fn = vi.fn(async () => undefined)
            await expect(
                db
                    .transaction()
                    .execute((trx) =>
                        localStorageContext.run({ db: { isTransaction: true } as never }, () =>
                            withTransaction(trx, fn),
                        ),
                    ),
            ).rejects.toThrow(alreadyOpen)
            expect(fn).not.toHaveBeenCalled()
        })

        it('still opens a transaction under a non-mutating action', async () => {
            await mockSessionWithTestData()
            const action = new Action('root-under-root').handler(async () =>
                withTransaction(currentDb(), async () => currentDb().isTransaction),
            )
            expect(await action()).toBe(true)
        })
    })
})

describe('api context', () => {
    it('reports an API call only when the store has an org', async () => {
        const org = await insertTestOrg()
        expect(localStorageContext.run({ db }, () => wasCalledFromAPI())).toBe(false)
        expect(localStorageContext.run({ org }, () => wasCalledFromAPI())).toBe(true)
    })

    it('throws AccessDeniedError when no org is in the store', () => {
        expect(() => localStorageContext.run({ db }, () => apiRequestingOrg())).toThrow(AccessDeniedError)
    })
})
