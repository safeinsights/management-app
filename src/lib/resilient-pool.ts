// Shared by the app and the editor service, which is built on Node strip-types: keep this file to
// erasable TypeScript (no enums, no parameter properties) and package imports only.
import PG from 'pg'

// Postgres SQLSTATE for "password authentication failed": the signal that a cached password is stale.
export const INVALID_PASSWORD_CODE = '28P01'

export function isInvalidPasswordError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === INVALID_PASSWORD_CODE
}

// The subset of pg.Pool that Kysely's PostgresDriver and the editor use; implementing it rather than
// extending pg.Pool keeps this testable without mocking pg.
export interface PoolLike {
    connect(): Promise<PG.PoolClient>
    query<R extends PG.QueryResultRow = PG.QueryResultRow>(text: string, values?: unknown[]): Promise<PG.QueryResult<R>>
    end(): Promise<void>
    on(event: 'error', listener: (err: Error, client: PG.PoolClient) => void): unknown
}

export type PoolFactory = (connectionString: string) => PoolLike

export type ConnectionStringResolver = () => Promise<string>

export const pgPoolFactory =
    (ssl: PG.PoolConfig['ssl']): PoolFactory =>
    (connectionString) =>
        new PG.Pool({ connectionString, ssl })

// A deploy can rotate the DB password while a warm process keeps a pool wired to the old
// connection string, so every new connection fails until the process is recycled (OTTER-626).
export class ResilientPool implements PoolLike {
    private connectionString: string
    private delegate: PoolLike
    private errorListeners: Array<(err: Error, client: PG.PoolClient) => void> = []
    private readonly makePool: PoolFactory
    private readonly resolveConnectionString: ConnectionStringResolver
    private readonly onRefresh?: () => void

    constructor(
        connectionString: string,
        makePool: PoolFactory,
        resolveConnectionString: ConnectionStringResolver,
        onRefresh?: () => void,
    ) {
        this.connectionString = connectionString
        this.makePool = makePool
        this.resolveConnectionString = resolveConnectionString
        this.onRefresh = onRefresh
        this.delegate = this.makePool(connectionString)
    }

    private async refresh(): Promise<void> {
        const next = await this.resolveConnectionString()
        if (next === this.connectionString) return
        this.connectionString = next
        const old = this.delegate
        this.delegate = this.makePool(next)
        for (const listener of this.errorListeners) this.delegate.on('error', listener)
        old.end().catch(() => {})
        this.onRefresh?.()
    }

    // On a stale password, retries once against whichever pool is current: concurrent failures all
    // get the pool the first refresh() built, instead of only the caller that rebuilt it.
    private async withRetry<T>(op: (pool: PoolLike) => Promise<T>): Promise<T> {
        const pool = this.delegate
        try {
            return await op(pool)
        } catch (err) {
            if (!isInvalidPasswordError(err)) throw err
            await this.refresh()
            if (this.delegate === pool) throw err
            return await op(this.delegate)
        }
    }

    connect(): Promise<PG.PoolClient> {
        return this.withRetry((pool) => pool.connect())
    }

    query<R extends PG.QueryResultRow = PG.QueryResultRow>(
        text: string,
        values?: unknown[],
    ): Promise<PG.QueryResult<R>> {
        return this.withRetry((pool) => pool.query<R>(text, values))
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
