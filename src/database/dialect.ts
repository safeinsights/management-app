import { PostgresDialect } from 'kysely'
import PG from 'pg'
import { RDS_SSL } from '../lib/db-connection'
import { pgPoolFactory, ResilientPool } from '../lib/resilient-pool'
import { databaseURL, DEPLOYED_ENV } from '../server/config'

// node-postgres builds a Date at server-local midnight from a `date`, which renders a day off when
// server and browser zones disagree. Hand back the raw YYYY-MM-DD instead.
PG.types.setTypeParser(PG.types.builtins.DATE, (value) => value)

export const dialect = new PostgresDialect({
    // ResilientPool rebuilds itself when a deploy rotates the DB password (OTTER-626).
    pool: async () =>
        new ResilientPool(await databaseURL(), pgPoolFactory(DEPLOYED_ENV ? RDS_SSL : undefined), databaseURL),
})
