import { Kysely, CamelCasePlugin } from 'kysely'
import { DB } from './database/types'
import { dialect } from './database/dialect'
import { DEV_ENV } from './server/config'

export const db = new Kysely<DB>({
    dialect,
    log: DEV_ENV ? ['error', 'query'] : ['error'],
    plugins: [new CamelCasePlugin()],
})
