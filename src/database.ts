import { Kysely, CamelCasePlugin, sql, type KyselyConfig } from 'kysely'
import { DB } from './database/types'
// TODO do we need snake_types anymore?
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

// TODO do we need snake_types anymore? this is unused
export const snake_case_db = new Kysely<snake_case_DB>(kyselyOpts)

export const BLANK_UUID = '00000000-0000-0000-0000-000000000000'
