import { defineConfig } from 'kysely-ctl'
import { dialect } from './src/database/dialect'
import { CamelCasePlugin } from 'kysely'

export default defineConfig({
    dialect,
    migrations: {
        migrationFolder: 'src/database/migrations',
    },
    plugins: [new CamelCasePlugin()],
    seeds: {
        seedFolder: 'src/database/seeds',
    },
})
