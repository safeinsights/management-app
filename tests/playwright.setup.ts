import { test as setup } from '@playwright/test'
import { execSync } from 'node:child_process'
import path from 'node:path'

// Global setup for the clerk-stub-backed e2e stack. The stub (started by the
// `webServer` config) owns auth, so instead of Clerk's real `clerkSetup()` we seed
// the stub's three test users (admin/researcher/reviewer) idempotently. The app's DB
// users/orgs are seeded separately by `pnpm test:e2e:up` (db:migrate against
// si_mgmnt_test). After this, tests/auth.setup.ts signs each role in once.

const STUB_DIR = process.env.CLERK_STUB_DIR ?? path.resolve(process.cwd(), '..', 'clerk-stub')

setup('seed clerk-stub users', async () => {
    for (const part of ['EMAIL', 'PASSWORD']) {
        const env = `CLERK_RESEARCHER_${part}`
        if (!process.env[env]) throw new Error(`Please provide ${env} (see .env.test).`)
    }

    // The stub's seed uses real @clerk/backend against the running stub; it is
    // idempotent (find-or-update by email) so re-running across local invocations is safe.
    execSync('npm run seed', {
        cwd: STUB_DIR,
        stdio: 'inherit',
        env: {
            ...process.env,
            CLERK_API_URL: process.env.CLERK_API_URL ?? 'https://localhost:4040',
            CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_clerkstub_dev_secret',
        },
    })
})
