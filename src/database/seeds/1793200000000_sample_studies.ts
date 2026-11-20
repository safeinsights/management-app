import type { Kysely } from 'kysely'
import type { DB } from '@/database/types'
import { createUploader } from '../sample-data/s3'
import { seedSampleData } from '../sample-data/seed-sample-data'

// Runtime imports stay relative: kysely-ctl does not resolve '@/', and the migrator Lambda
// bundles this file alone.
//
// Runs in every environment, production included: it writes only to the Mars U QA orgs
// (OTTER-941), and the migrator runs this seed alone outside the test-data environments. The
// openstax fixture fallback stays behind ALLOW_TESTING_DATA, the same opt-in as
// 1743608138837_test_users.ts, because in production openstax is a real Data Partner.
export async function seed(db: Kysely<DB>): Promise<void> {
    const fixtureFallback = process.env.ALLOW_TESTING_DATA === 'TRUE'
    const uploader = createUploader(process.env)
    if (!uploader) console.warn('sample-data: BUCKET_NAME is not set, so studies with files are skipped.')
    // Sample data is optional: a bug here must not fail the migration and block a deploy.
    try {
        await seedSampleData(db, { uploader, fixtureFallback })
    } catch (error) {
        console.error(`sample-data: seed failed, no sample data written: ${String(error)}`)
    }
}
