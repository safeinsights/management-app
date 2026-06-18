import PG from 'pg'
import { databaseURL, DEPLOYED_ENV } from '@/server/config'

// Postgres SQLSTATE for "password authentication failed". A connection that
// fails with this code is the signal that the cached DB password may be stale.
const INVALID_PASSWORD_CODE = '28P01'

function isInvalidPasswordError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === INVALID_PASSWORD_CODE
}

// The subset of pg.Pool that Kysely's PostgresDriver actually uses: connect()
// per query and end() on teardown (PostgresPool in kysely). Implementing the
// interface rather than extending pg.Pool keeps this unit-testable without
// mocking pg.
export interface PoolLike {
    connect(): Promise<PG.PoolClient>
    end(): Promise<void>
    on(event: 'error', listener: (err: Error, client: PG.PoolClient) => void): unknown
}

export type PoolFactory = (connectionString: string) => PoolLike

// Resolver for the (possibly rotated) connection string. Defaults to the real
// secret/env lookup; injectable so tests stay hermetic.
export type ConnectionStringResolver = () => Promise<string>

const defaultPoolFactory: PoolFactory = (connectionString) =>
    new PG.Pool({
        connectionString,
        ...(DEPLOYED_ENV && { ssl: { rejectUnauthorized: false } }),
    })

// A DB pool that re-reads DATABASE_URL (or the DB_SECRET_ARN secret) and
// rebuilds itself when a connection is rejected with 28P01. A deploy can rotate
// the DB password while a warm Lambda/server process keeps a pool wired to the
// old connection string; without this, every new connection fails until the
// process is recycled (OTTER-626). On a password change new connections
// immediately use the fresh credentials; an unchanged password means a genuine
// auth problem and the original error propagates.
//
// Kysely obtains a client via connect() per query, so 28P01 surfaces there;
// recovering in connect() lets every Kysely query benefit.
export class ResilientPool implements PoolLike {
    private connectionString: string
    private delegate: PoolLike
    private errorListeners: Array<(err: Error, client: PG.PoolClient) => void> = []

    constructor(
        connectionString: string,
        private readonly makePool: PoolFactory = defaultPoolFactory,
        private readonly resolveConnectionString: ConnectionStringResolver = databaseURL,
    ) {
        this.connectionString = connectionString
        this.delegate = this.makePool(connectionString)
    }

    // Re-fetch the connection string; if the password changed, swap in a fresh
    // delegate pool and return true (retry worthwhile). Unchanged → false.
    private async refresh(): Promise<boolean> {
        const next = await this.resolveConnectionString()
        if (next === this.connectionString) return false
        this.connectionString = next
        const old = this.delegate
        this.delegate = this.makePool(next)
        // Carry registered error listeners onto the replacement pool.
        for (const listener of this.errorListeners) this.delegate.on('error', listener)
        old.end().catch(() => {})
        return true
    }

    async connect(): Promise<PG.PoolClient> {
        try {
            return await this.delegate.connect()
        } catch (err) {
            if (!isInvalidPasswordError(err) || !(await this.refresh())) throw err
            return await this.delegate.connect()
        }
    }

    end(): Promise<void> {
        return this.delegate.end()
    }

    on(event: 'error', listener: (err: Error, client: PG.PoolClient) => void): this {
        // Track and forward to the live delegate so idle-client errors still
        // reach callers, and survive a refresh() rebuild. (Kysely doesn't
        // subscribe, but the pg.Pool contract emits these.)
        this.errorListeners.push(listener)
        this.delegate.on(event, listener)
        return this
    }
}
