// A self-healing Postgres pool for the editor service.
//
// Wraps pg.Pool so that a query failing with `28P01 password authentication
// failed` triggers a one-shot recovery: re-fetch the DB secret, and if the
// password actually changed, rebuild the pool against the fresh credentials and
// retry the query once. This recovers from a deploy-driven password change
// without restarting the long-running editor task (OTTER-626).
//
// When the source is a static DATABASE_URL (local/dev) there is nothing to
// refresh, so the wrapper degrades to a plain pass-through.

import pg from 'pg'
import { type DbSource, isInvalidPasswordError } from './db-credentials.ts'

export type QueryResult<T> = { rows: T[]; rowCount: number | null }

type Logger = (event: string, fields?: Record<string, unknown>) => void

// Factory seam so tests can substitute a fake pool without a real Postgres.
export type PoolFactory = (settings: { connectionString: string; ssl?: { rejectUnauthorized: boolean } }) => pg.Pool

const defaultPoolFactory: PoolFactory = (settings) => new pg.Pool(settings)

export class ResilientDbPool {
    private pool: pg.Pool
    private readonly source: DbSource
    private readonly log: Logger
    private readonly makePool: PoolFactory

    constructor(source: DbSource, log: Logger, makePool: PoolFactory = defaultPoolFactory) {
        this.source = source
        this.log = log
        this.makePool = makePool
        this.pool = this.build()
    }

    private settings(): { connectionString: string; ssl?: { rejectUnauthorized: boolean } } {
        return this.source.kind === 'connectionString' ? this.source.settings : this.source.credentials.poolSettings()
    }

    private build(): pg.Pool {
        const pool = this.makePool(this.settings())
        pool.on('error', (err) => this.log('db.pool.error', { message: err.message }))
        return pool
    }

    // Re-fetch credentials and, if the password changed, swap in a fresh pool.
    // Returns true when the pool was rebuilt (retry worthwhile). The old pool is
    // ended in the background; its in-flight queries reject independently.
    private async recover(): Promise<boolean> {
        if (this.source.kind !== 'secret') return false
        const changed = await this.source.credentials.refresh()
        if (!changed) {
            this.log('db.credentials.unchanged')
            return false
        }
        this.log('db.credentials.rotated')
        const old = this.pool
        this.pool = this.build()
        old.end().catch((err) =>
            this.log('db.pool.end.error', { message: err instanceof Error ? err.message : String(err) }),
        )
        return true
    }

    // pg.Pool-compatible query, with one-shot recovery on a stale password.
    async query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>> {
        try {
            return (await this.pool.query(text, values)) as unknown as QueryResult<T>
        } catch (err) {
            if (!isInvalidPasswordError(err)) throw err
            this.log('db.auth.stale', { message: err instanceof Error ? err.message : String(err) })
            const recovered = await this.recover()
            if (!recovered) throw err
            return (await this.pool.query(text, values)) as unknown as QueryResult<T>
        }
    }

    async ping(): Promise<Date | undefined> {
        const result = await this.query<{ now: Date }>('SELECT now() AS now')
        return result.rows[0]?.now
    }
}
