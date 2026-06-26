import { PostgresDialect } from 'kysely'
import { databaseURL } from '../server/config'
import { ResilientPool } from './resilient-pool'

export const dialect = new PostgresDialect({
    // ResilientPool re-reads the DB secret and rebuilds itself if a deploy
    // rotates the password, so a warm process recovers without a restart
    // (OTTER-626).
    pool: async () => new ResilientPool(await databaseURL()),
})
