import type { Kysely } from 'kysely'
import type { DB } from '@/database/types'
import { createUploader } from '../sample-data/s3'
import { seedSampleData } from '../sample-data/seed-sample-data'

// Runtime imports stay relative: kysely-ctl does not resolve '@/', and the migrator Lambda
// bundles this file alone. Same opt-in and production backstop as 1743608138837_test_users.ts.
export async function seed(db: Kysely<DB>): Promise<void> {
    if (process.env.ALLOW_TESTING_DATA !== 'TRUE') {
        console.warn('Skipping sample data seed: ALLOW_TESTING_DATA=TRUE is not set.')
        return
    }
    const envName = (process.env.ENVIRONMENT_ID || '').toLowerCase()
    if (envName === 'production' || envName === 'prod') {
        console.warn('Refusing to seed sample data into a production environment.')
        return
    }

    const uploader = createUploader()
    if (!uploader) console.warn('sample-data: BUCKET_NAME is not set, so studies get rows but no files.')
    await seedSampleData(db, { uploader })
}
