import { afterEach, beforeEach, db, describe, expect, it } from '@/tests/unit.helpers'
import fs from 'node:fs'
import path from 'node:path'
import { TEST_PUBLIC_KEY_PEM, seed } from './seeds/1743608138837_test_users'

// This test lives outside src/database/seeds because the deploy pipeline bundles
// every *.ts file in that directory as a seed.
describe('test users seed', () => {
    it('embedded public key matches tests/support/public_key.pem', () => {
        const filePem = fs.readFileSync(path.resolve(process.cwd(), 'tests/support/public_key.pem'), 'utf8')
        expect(TEST_PUBLIC_KEY_PEM.trim()).toEqual(filePem.trim())
    })

    // This seed ran against production because its guard was an opt-out on a variable nothing
    // ever set. Both checks below must keep failing closed.
    describe('safety guards', () => {
        const savedEnv = { ...process.env }

        beforeEach(() => {
            delete process.env.ALLOW_TESTING_DATA
            delete process.env.ENVIRONMENT_ID
            delete process.env.DEPLOY_ENV
        })

        afterEach(() => {
            process.env = { ...savedEnv }
        })

        // Counting the seed's fixed-UUID orgs detects a seed run without depending on whether
        // db:migrate already populated them, which it has in CI.
        const seededOrgCount = async () => {
            const rows = await db
                .selectFrom('org')
                .select('id')
                .where('id', 'in', [
                    '00000000-0000-4000-8000-000000000101',
                    '00000000-0000-4000-8000-000000000103',
                    '00000000-0000-4000-8000-000000000105',
                ])
                .execute()
            return rows.length
        }

        it('does nothing without ALLOW_TESTING_DATA', async () => {
            const before = await seededOrgCount()
            await seed(db)
            expect(await seededOrgCount()).toEqual(before)
        })

        it('does nothing in production even when ALLOW_TESTING_DATA is set', async () => {
            process.env.ALLOW_TESTING_DATA = '1'
            process.env.ENVIRONMENT_ID = 'production'
            const before = await seededOrgCount()
            await seed(db)
            expect(await seededOrgCount()).toEqual(before)
        })
    })
})
