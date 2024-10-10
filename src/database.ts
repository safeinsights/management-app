import { Kysely, CamelCasePlugin, sql, type KyselyConfig } from 'kysely'
import { DB } from './database/types'
import { DB as snake_case_DB } from './database/snake_case_types'
import { dialect } from './database/dialect'
import { DEV_ENV } from './server/config'

export { sql }

const kyselyOpts: KyselyConfig = {
    dialect,
    log: DEV_ENV ? ['error', 'query'] : ['error'],
}

export const db = new Kysely<DB>({
    ...kyselyOpts,
    plugins: [new CamelCasePlugin()],
})

export const snake_case_db = new Kysely<snake_case_DB>(kyselyOpts)
