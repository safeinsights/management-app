import { describe, expect, it, vi } from 'vitest'

import { DbCredentials, INVALID_PASSWORD_CODE, type DbSource, type SecretFetcher } from './db-credentials'
import { ResilientDbPool, type PoolFactory } from './db-pool'

const SECRET = { username: 'u', password: 'old-pw', host: 'h', dbname: 'd' }

function invalidPasswordError(): Error & { code: string } {
    return Object.assign(new Error('password authentication failed for user "u"'), { code: INVALID_PASSWORD_CODE })
}

// Builds a fake pg.Pool whose query() reads from a queued list of behaviors:
// either resolve with rows or throw. Records how many pools were built so we can
// assert a rebuild happened (or didn't).
function fakePoolFactory(behaviorsByPool: Array<Array<() => unknown>>) {
    const built: Array<{ ended: boolean; queries: number }> = []
    const factory: PoolFactory = () => {
        const idx = built.length
        const state = { ended: false, queries: 0 }
        built.push(state)
        const behaviors = behaviorsByPool[idx] ?? []
        return {
            on: () => {},
            end: async () => {
                state.ended = true
            },
            query: async () => {
                const behavior = behaviors[state.queries] ?? (() => ({ rows: [], rowCount: 0 }))
                state.queries += 1
                const result = behavior()
                if (result instanceof Error) throw result
                return result
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
    }
    return { factory, built }
}

async function secretSource(secrets: Array<typeof SECRET>): Promise<DbSource> {
    let i = 0
    const send = vi.fn(async () => {
        const secret = secrets[Math.min(i, secrets.length - 1)]
        i += 1
        return { SecretString: JSON.stringify(secret) }
    })
    const credentials = await DbCredentials.resolve('arn', { send } as unknown as SecretFetcher)
    return { kind: 'secret', credentials }
}

const noopLog = () => {}

describe('ResilientDbPool', () => {
    it('passes through successful queries without rebuilding', async () => {
        const source = await secretSource([SECRET])
        const { factory, built } = fakePoolFactory([[() => ({ rows: [{ now: 1 }], rowCount: 1 })]])
        const pool = new ResilientDbPool(source, noopLog, factory)

        const result = await pool.query('SELECT now()')
        expect(result.rows).toEqual([{ now: 1 }])
        expect(built).toHaveLength(1)
    })

    it('rethrows non-password errors without recovery', async () => {
        const source = await secretSource([SECRET])
        const { factory, built } = fakePoolFactory([[() => new Error('syntax error')]])
        const pool = new ResilientDbPool(source, noopLog, factory)

        await expect(pool.query('SELECT bad')).rejects.toThrow('syntax error')
        expect(built).toHaveLength(1)
    })

    it('refreshes the secret and retries on a rotated password', async () => {
        const source = await secretSource([SECRET, { ...SECRET, password: 'new-pw' }])
        const { factory, built } = fakePoolFactory([
            [() => invalidPasswordError()], // first pool: stale password
            [() => ({ rows: [{ ok: true }], rowCount: 1 })], // rebuilt pool: succeeds
        ])
        const pool = new ResilientDbPool(source, noopLog, factory)

        const result = await pool.query('SELECT 1')
        expect(result.rows).toEqual([{ ok: true }])
        expect(built).toHaveLength(2)
        expect(built[0].ended).toBe(true) // stale pool was torn down
    })

    it('does not retry when the password is unchanged (genuine credential failure)', async () => {
        const source = await secretSource([SECRET, SECRET])
        const { factory, built } = fakePoolFactory([[() => invalidPasswordError()]])
        const pool = new ResilientDbPool(source, noopLog, factory)

        await expect(pool.query('SELECT 1')).rejects.toMatchObject({ code: INVALID_PASSWORD_CODE })
        expect(built).toHaveLength(1) // no rebuild
    })

    it('does not refresh for a static DATABASE_URL source', async () => {
        const source: DbSource = { kind: 'connectionString', settings: { connectionString: 'postgres://local/dev' } }
        const { factory, built } = fakePoolFactory([[() => invalidPasswordError()]])
        const pool = new ResilientDbPool(source, noopLog, factory)

        await expect(pool.query('SELECT 1')).rejects.toMatchObject({ code: INVALID_PASSWORD_CODE })
        expect(built).toHaveLength(1)
    })
})
