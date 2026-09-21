/* eslint-disable no-console */
import { ENVIRONMENT_ID, PROD_ENV } from '@/server/config'

// One gate for every tsx entry point that writes test fixtures: the committed test keypair
// (its private half is public by design at tests/support/private_key.pem) and admin memberships
// on the real org slugs. Only the literal 'TRUE' opts in — the value iac's app-stack.ts sets for
// the migrator Lambda — so ALLOW_TESTING_DATA=false or =0 cannot enable the writes by accident.
// The Kysely seed (src/database/seeds/1743608138837_test_users.ts) needs the same gate but
// cannot import this file — the migrator Lambda's esbuild ESM bundle chokes on @/server/config —
// so it duplicates these checks inline; keep the two in sync.
// PROD_ENV is fixed at config-import time; that is fine here because every caller is a one-shot
// tsx process whose environment cannot change after startup.
export function testingDataAllowed(script: string): boolean {
    if (process.env.ALLOW_TESTING_DATA !== 'TRUE') {
        console.log(`${script}: skipping — writing test data requires ALLOW_TESTING_DATA=TRUE.`)
        return false
    }
    if (PROD_ENV) {
        console.log(`${script}: refusing to write test data to production (ENVIRONMENT_ID=${ENVIRONMENT_ID}).`)
        return false
    }
    return true
}
