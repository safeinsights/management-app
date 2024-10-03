import { PostgresDialect } from 'kysely'
import { Pool } from 'pg'

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

export const dialect = new PostgresDialect({
    pool: new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432',
        max: 10,
    }),
})
