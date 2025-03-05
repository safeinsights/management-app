import { defineConfig } from 'kysely-ctl'
import { dialect } from '@/database/dialect'

export default defineConfig({
    dialect,
    migrations: {
        migrationFolder: 'src/database/migrations',
    },
    seeds: {
        seedFolder: 'src/database/seeds',
    },
})
