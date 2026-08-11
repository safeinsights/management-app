import { PostgresDialect } from 'kysely'
import PG from 'pg'
import { databaseURL } from '../server/config'
import { ResilientPool } from './resilient-pool'

// A `date` carries a day with no instant, but node-postgres builds a Date at server-local midnight
// from it, which renders a day early or late once the server and the browser disagree about their
// zone. Hand back the raw YYYY-MM-DD instead. Process-global to the pg module, and matched by
// `--date-parser string` on update-db-types so the generated types say so too.
PG.types.setTypeParser(PG.types.builtins.DATE, (value) => value)

export const dialect = new PostgresDialect({
    // ResilientPool re-reads the DB secret and rebuilds itself if a deploy
    // rotates the password, so a warm process recovers without a restart
    // (OTTER-626).
    pool: async () => new ResilientPool(await databaseURL()),
})
