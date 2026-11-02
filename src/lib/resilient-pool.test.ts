import { describe, expect, it, vi } from 'vitest'
import { isInvalidPasswordError, ResilientPool, type PoolLike, type PoolFactory } from './resilient-pool'

function invalidPasswordError() {
    return Object.assign(new Error('password authentication failed for user "u"'), { code: '28P01' })
}

function trackingFactory() {
    const pools: Array<{
        connectionString: string
        client: object
        connect: ReturnType<typeof vi.fn>
        query: ReturnType<typeof vi.fn>
        end: ReturnType<typeof vi.fn>
        on: ReturnType<typeof vi.fn>
    }> = []
    const factory: PoolFactory = (connectionString) => {
        const client = {}
        const pool: PoolLike = {
            connect: vi.fn(async () => client as never),
            query: vi.fn(async () => ({ rows: [{ ok: true }], rowCount: 1 }) as never),
            end: vi.fn(async () => {}),
            on: vi.fn(),
        }
        pools.push({
            connectionString,
            client,
            connect: pool.connect as never,
            query: pool.query as never,
            end: pool.end as never,
            on: pool.on as never,
        })
        return pool
    }
    return { factory, pools }
}

describe('ResilientPool', () => {
    it('returns the client from the delegate on success', async () => {
        const { factory, pools } = trackingFactory()
        const resolve = vi.fn()
        const pool = new ResilientPool('postgres://u:old@h/d', factory, resolve)

        await expect(pool.connect()).resolves.toBe(pools[0].client)
        expect(pools).toHaveLength(1)
        expect(resolve).not.toHaveBeenCalled()
    })

    it('rebuilds with fresh credentials and retries when the password rotated', async () => {
        const { factory, pools } = trackingFactory()
        const resolve = vi.fn(async () => 'postgres://u:new@h/d')
        const pool = new ResilientPool('postgres://u:old@h/d', factory, resolve)
        pools[0].connect.mockRejectedValue(invalidPasswordError())

        const client = await pool.connect()

        expect(pools).toHaveLength(2)
        expect(client).toBe(pools[1].client)
        expect(pools[1].connectionString).toBe('postgres://u:new@h/d')
        expect(pools[0].end).toHaveBeenCalled()
    })

    it('rethrows and does not rebuild when the password is unchanged', async () => {
        const { factory, pools } = trackingFactory()
        const resolve = vi.fn(async () => 'postgres://u:old@h/d')
        const pool = new ResilientPool('postgres://u:old@h/d', factory, resolve)
        pools[0].connect.mockRejectedValue(invalidPasswordError())

        await expect(pool.connect()).rejects.toMatchObject({ code: '28P01' })
        expect(pools).toHaveLength(1)
    })

    it('resolves every concurrent caller after one rebuild', async () => {
        const { factory, pools } = trackingFactory()
        const resolve = vi.fn(async () => 'postgres://u:new@h/d')
        const onRefresh = vi.fn()
        const pool = new ResilientPool('postgres://u:old@h/d', factory, resolve, onRefresh)
        pools[0].connect.mockRejectedValue(invalidPasswordError())

        const clients = await Promise.all([pool.connect(), pool.connect(), pool.connect()])

        expect(pools).toHaveLength(2)
        expect(clients).toEqual([pools[1].client, pools[1].client, pools[1].client])
        expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('re-registers error listeners on the rebuilt pool after rotation', async () => {
        const { factory, pools } = trackingFactory()
        const resolve = vi.fn(async () => 'postgres://u:new@h/d')
        const pool = new ResilientPool('postgres://u:old@h/d', factory, resolve)
        const listener = vi.fn()
        pool.on('error', listener)
        pools[0].connect.mockRejectedValue(invalidPasswordError())

        await pool.connect()

        expect(pools[0].on).toHaveBeenCalledWith('error', listener)
        expect(pools[1].on).toHaveBeenCalledWith('error', listener)
    })

    it('retries a query on the rebuilt pool when the password rotated', async () => {
        const { factory, pools } = trackingFactory()
        const resolve = vi.fn(async () => 'postgres://u:new@h/d')
        const pool = new ResilientPool('postgres://u:old@h/d', factory, resolve)
        pools[0].query.mockRejectedValue(invalidPasswordError())

        const result = await pool.query('SELECT 1', [1])

        expect(result.rows).toEqual([{ ok: true }])
        expect(pools[1].query).toHaveBeenCalledWith('SELECT 1', [1])
        expect(pools[0].end).toHaveBeenCalled()
    })

    it('rethrows non-password errors without re-reading the secret', async () => {
        const { factory, pools } = trackingFactory()
        const resolve = vi.fn()
        const pool = new ResilientPool('postgres://u:old@h/d', factory, resolve)
        pools[0].connect.mockRejectedValue(new Error('connection refused'))

        await expect(pool.connect()).rejects.toThrow('connection refused')
        expect(resolve).not.toHaveBeenCalled()
        expect(pools).toHaveLength(1)
    })
})

describe('isInvalidPasswordError', () => {
    it('matches only the Postgres 28P01 SQLSTATE', () => {
        expect(isInvalidPasswordError({ code: '28P01' })).toBe(true)
        expect(isInvalidPasswordError({ code: '08006' })).toBe(false)
        expect(isInvalidPasswordError(new Error('boom'))).toBe(false)
        expect(isInvalidPasswordError(null)).toBe(false)
    })
})
