import { defineConfig } from 'kysely-ctl'
import { dialect } from './src/database/dialect'
import { CamelCasePlugin } from 'kysely'

export default defineConfig({
    dialect,
    migrations: {
        migrationFolder: 'src/database/migrations',
        allowUnorderedMigrations: true, // needed to allow dev to merge branches https://github.com/kysely-org/kysely/issues/697#issuecomment-2103078857
    },
    plugins: [
        new CamelCasePlugin({
            maintainNestedObjectKeys: true,
        }),
    ],
    seeds: {
        seedFolder: 'src/database/seeds',
    },
})
