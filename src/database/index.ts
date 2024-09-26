import { Database } from '../database/types' // we define our data types, later on we will see how to create them.
import { Pool } from 'pg'
import { Kysely, PostgresDialect } from 'kysely'

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const dialect = new PostgresDialect({
    pool: new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432',
        // database: process.env.DB_DATABASE,
        // host: process.env.DB_HOST,
        // user: process.env.DB_USER,
        // password: process.env.DB_PASSWORD,
        // port: Number(process.env.DB_PORT),
        max: 10,
    }),
})

export const db = new Kysely<Database>({
    dialect,
})
