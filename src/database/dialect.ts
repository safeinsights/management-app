import { PostgresDialect } from 'kysely'
import PG from 'pg'
import { databaseURL, DEPLOYED_ENV } from './env'

export const dialect = new PostgresDialect({
    pool: async () => {
        const config = await databaseURL()
        return new PG.Pool({
            connectionString: config,
            ...(DEPLOYED_ENV && { ssl: { rejectUnauthorized: false } }),
        })
    },
})
