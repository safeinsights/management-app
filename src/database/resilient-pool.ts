import PG from 'pg'
import { databaseURL, DEPLOYED_ENV } from '../server/config'

// Postgres SQLSTATE for "password authentication failed".
const INVALID_PASSWORD_CODE = '28P01'

function isInvalidPasswordError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === INVALID_PASSWORD_CODE
}

// The subset of pg.Pool that Kysely's PostgresDriver uses; implementing it rather than extending
// pg.Pool keeps this testable without mocking pg.
export interface PoolLike {
    connect(): Promise<PG.PoolClient>
    end(): Promise<void>
    on(event: 'error', listener: (err: Error, client: PG.PoolClient) => void): unknown
}

export type PoolFactory = (connectionString: string) => PoolLike

export type ConnectionStringResolver = () => Promise<string>

const defaultPoolFactory: PoolFactory = (connectionString) =>
    new PG.Pool({
        connectionString,
        ...(DEPLOYED_ENV && { ssl: { rejectUnauthorized: false } }),
    })

// A deploy can rotate the DB password while a warm process keeps a pool wired to the old
// connection string, so every new connection fails until the process is recycled (OTTER-626).
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

    // Returns whether the connection string changed, i.e. whether a retry is worthwhile.
    private async refresh(): Promise<boolean> {
        const next = await this.resolveConnectionString()
        if (next === this.connectionString) return false
        this.connectionString = next
        const old = this.delegate
        this.delegate = this.makePool(next)
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
        // Tracked as well as forwarded so the listeners survive a refresh() rebuild.
        this.errorListeners.push(listener)
        this.delegate.on(event, listener)
        return this
    }
}
