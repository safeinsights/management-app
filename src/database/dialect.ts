import { PostgresDialect } from 'kysely'
import { Pool } from 'pg'

export const dialect = new PostgresDialect({
    pool: new Pool({
        max: 10,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        connectionString: process.env.DB_DBNAME ? undefined : process.env.DATABASE_URL || 'postgresql://localhost:5432',
    }),
})
