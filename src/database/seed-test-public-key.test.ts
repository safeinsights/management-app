import { afterEach, beforeEach, db, describe, expect, it } from '@/tests/unit.helpers'
import fs from 'node:fs'
import path from 'node:path'
import { sql } from 'kysely'
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
        // Individual deletes rather than restoring a process.env snapshot: a snapshot taken at
        // collection time still holds the Clerk keys that tests/vitest.setup.ts deletes in its
        // beforeAll, so restoring it would re-arm them for every later test in the worker.
        const clearGuardEnv = () => {
            delete process.env.ALLOW_TESTING_DATA
            delete process.env.ENVIRONMENT_ID
        }

        beforeEach(clearGuardEnv)
        afterEach(clearGuardEnv)

        // db:migrate has already run this seed in CI, so a gated no-op is only observable by
        // deleting a seeded fixture and asserting the guarded call does not restore it. The
        // fixture is the admin user's public key row: unlike the seeded orgs, user_public_key
        // has no inbound foreign keys, so the delete cannot trip over rows other tests create
        // (org rows are referenced with NO ACTION by study, org_user, and pending_user). The
        // delete rolls back with the test transaction. The user is resolved by id OR email the
        // same way the seed resolves it, for deployments whose row predates the fixed UUIDs.
        const SEEDED_ADMIN = {
            id: '00000000-0000-4000-8000-000000000001',
            email: 'si-adm-tester-dbfyq3@mailinator.com',
        }

        const seededAdminId = async () => {
            const user = await db
                .selectFrom('user')
                .select('id')
                .where((eb) => eb.or([eb('id', '=', SEEDED_ADMIN.id), eb(sql`lower(email)`, '=', SEEDED_ADMIN.email)]))
                .executeTakeFirstOrThrow()
            return user.id
        }

        const deleteSeededKey = async () =>
            db
                .deleteFrom('userPublicKey')
                .where('userId', '=', await seededAdminId())
                .execute()

        const seededKeyExists = async () =>
            Boolean(
                await db
                    .selectFrom('userPublicKey')
                    .select('id')
                    .where('userId', '=', await seededAdminId())
                    .executeTakeFirst(),
            )

        // Positive control: proves the delete-then-reseed harness can observe a seed run at all,
        // so the guard assertions below cannot pass vacuously.
        it('seeds when opted in with the literal TRUE', async () => {
            process.env.ALLOW_TESTING_DATA = 'TRUE'
            await deleteSeededKey()
            await seed(db)
            expect(await seededKeyExists()).toBe(true)
        })

        it('does nothing without ALLOW_TESTING_DATA', async () => {
            await deleteSeededKey()
            await seed(db)
            expect(await seededKeyExists()).toBe(false)
        })

        it('does nothing for truthy values other than the literal TRUE', async () => {
            process.env.ALLOW_TESTING_DATA = '1'
            await deleteSeededKey()
            await seed(db)
            expect(await seededKeyExists()).toBe(false)
        })

        it('does nothing in production even when ALLOW_TESTING_DATA is set', async () => {
            process.env.ALLOW_TESTING_DATA = 'TRUE'
            process.env.ENVIRONMENT_ID = 'production'
            await deleteSeededKey()
            await seed(db)
            expect(await seededKeyExists()).toBe(false)
        })
    })
})
