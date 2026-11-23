import { AsyncLocalStorage } from 'node:async_hooks'
import { db, type DBExecutor, type Transaction } from '@/database'
import type { UserSessionWithAbility } from '@/lib/session'
import type { Org } from '@/schema/org'
import { AccessDeniedError } from '@/lib/errors'
import logger from '@/lib/logger'

// Queues work that must not run until the handler's writes are visible to anyone else. A mutating
// handler runs inside a transaction, so anything it hands to another process from inside the
// handler can read the round before it exists (OTTER-799).
export type AfterCommitFn = (fn: () => Promise<unknown>) => void

export type RequestContext = {
    db?: DBExecutor
    session?: UserSessionWithAbility
    params?: unknown
    afterCommit?: AfterCommitFn
    org?: Org
}

export const localStorageContext = new AsyncLocalStorage<RequestContext>()

export const currentDb = (): DBExecutor => localStorageContext.getStore()?.db ?? db

// Run only once the writes are committed. One hook failing must not fail the caller: the change it
// asked for already happened.
export function afterCommitQueue() {
    const hooks: (() => Promise<unknown>)[] = []
    const afterCommit: AfterCommitFn = (hook) => {
        hooks.push(hook)
    }
    const run = async () => {
        for (const hook of hooks) {
            try {
                await hook()
            } catch (error: unknown) {
                logger.error(error)
            }
        }
    }
    return { afterCommit, run }
}

// Binds currentDb() to the transaction while it is open; work captured inside must not keep it afterward.
export async function withTransaction<T>(executor: DBExecutor, fn: (trx: Transaction) => Promise<T>): Promise<T> {
    const outer = localStorageContext.getStore()
    if (outer?.db?.isTransaction && executor !== outer.db) {
        throw new Error('a transaction is already open here; pass currentDb() so this work joins it')
    }
    // Only withTransaction() opens one, and it always binds it, so an unbound one leaked out of its context.
    if (executor.isTransaction) {
        if (outer?.db !== executor) throw new Error('this transaction is not bound here; pass currentDb()')
        return fn(executor as Transaction)
    }

    const settledDb = outer?.db ?? db
    const queue = afterCommitQueue()
    const owned: RequestContext = { ...outer, afterCommit: queue.afterCommit }
    const settle = () => {
        owned.db = settledDb
        owned.afterCommit = outer?.afterCommit
    }
    try {
        const result = await executor.transaction().execute((trx) => {
            owned.db = trx
            return localStorageContext.run(owned, () => fn(trx))
        })
        settle()
        await localStorageContext.run(owned, queue.run)
        return result
    } finally {
        settle()
    }
}

export function apiRequestingOrg() {
    const org = localStorageContext.getStore()?.org
    if (!org) throw new AccessDeniedError({ org: 'was not found in api context' })
    return org
}

export const wasCalledFromAPI = () => Boolean(localStorageContext.getStore()?.org)
