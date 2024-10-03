import { Kysely, CamelCasePlugin } from 'kysely'
import { DB } from './database/types'
import { dialect } from './database/dialect'

export * from './database/types'

export const db = new Kysely<DB>({
    dialect,
    log: ['error', ...(process.env.NODE_ENV === 'development' ? ['query', 'info'] : [])],
    plugins: [new CamelCasePlugin()],
})
