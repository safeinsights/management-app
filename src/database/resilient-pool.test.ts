import { describe, expect, it, vi } from 'vitest'
import { ResilientPool, type PoolLike, type PoolFactory } from './resilient-pool'

function invalidPasswordError() {
    return Object.assign(new Error('password authentication failed for user "u"'), { code: '28P01' })
}

// Records every pool the factory builds so tests can stage per-pool behavior
// and assert which connection string each was built with.
function trackingFactory() {
    const pools: Array<{
        connectionString: string
        client: object
        connect: ReturnType<typeof vi.fn>
        end: ReturnType<typeof vi.fn>
        on: ReturnType<typeof vi.fn>
    }> = []
    const factory: PoolFactory = (connectionString) => {
        const client = {}
        const pool: PoolLike = {
            connect: vi.fn(async () => client as never),
            end: vi.fn(async () => {}),
            on: vi.fn(),
        }
        pools.push({
            connectionString,
            client,
            connect: pool.connect as never,
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
        expect(client).toBe(pools[1].client) // came from the rebuilt pool
        expect(pools[1].connectionString).toBe('postgres://u:new@h/d')
        expect(pools[0].end).toHaveBeenCalled() // stale pool torn down
    })

    it('rethrows and does not rebuild when the password is unchanged', async () => {
        const { factory, pools } = trackingFactory()
        const resolve = vi.fn(async () => 'postgres://u:old@h/d')
        const pool = new ResilientPool('postgres://u:old@h/d', factory, resolve)
        pools[0].connect.mockRejectedValue(invalidPasswordError())

        await expect(pool.connect()).rejects.toMatchObject({ code: '28P01' })
        expect(pools).toHaveLength(1)
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
        expect(pools[1].on).toHaveBeenCalledWith('error', listener) // carried over
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
