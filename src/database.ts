import { Kysely, CamelCasePlugin } from 'kysely'
import { DB } from './database/types'

import { dialect } from './database/dialect'

export const db = new Kysely<DB>({
    dialect,
    plugins: [new CamelCasePlugin()],
})
