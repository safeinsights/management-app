import { afterEach, beforeEach, db, describe, expect, it } from '@/tests/unit.helpers'
import fs from 'node:fs'
import path from 'node:path'
import { sql } from 'kysely'
import { TEST_PUBLIC_KEY_PEM, seed } from './seeds/1743608138837_test_users'

// Lives outside src/database/seeds because the deploy pipeline bundles every *.ts file there as a seed.
describe('test users seed', () => {
    it('embedded public key matches tests/support/public_key.pem', () => {
        const filePem = fs.readFileSync(path.resolve(process.cwd(), 'tests/support/public_key.pem'), 'utf8')
        expect(TEST_PUBLIC_KEY_PEM.trim()).toEqual(filePem.trim())
    })

    // This seed once ran against production, so both guards must keep failing closed.
    describe('safety guards', () => {
        // Individual deletes rather than a process.env snapshot: a snapshot taken at collection time
        // would re-arm the Clerk keys that tests/vitest.setup.ts deletes in its beforeAll.
        const clearGuardEnv = () => {
            delete process.env.ALLOW_TESTING_DATA
            delete process.env.ENVIRONMENT_ID
        }

        beforeEach(clearGuardEnv)
        afterEach(clearGuardEnv)

        // The admin's public key row is the fixture because user_public_key has no inbound foreign
        // keys, so deleting it cannot trip over rows other tests create.
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

        // Positive control, so the guard assertions below cannot pass vacuously.
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
