import { PostgresDialect } from 'kysely'
import PG from 'pg'
import { databaseURL } from '@/server/config'

export const dialect = new PostgresDialect({
    pool: async () => {
        const config = await databaseURL()
        return new PG.Pool({
            connectionString: config,
        })
    },
})
