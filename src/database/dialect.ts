import { PostgresDialect } from 'kysely'
import PG from 'pg'
import { databaseURL } from '../server/config'
import { ResilientPool } from './resilient-pool'

// node-postgres builds a Date at server-local midnight from a `date`, which renders a day off when
// server and browser zones disagree. Hand back the raw YYYY-MM-DD instead.
PG.types.setTypeParser(PG.types.builtins.DATE, (value) => value)

export const dialect = new PostgresDialect({
    // ResilientPool rebuilds itself when a deploy rotates the DB password (OTTER-626).
    pool: async () => new ResilientPool(await databaseURL()),
})
