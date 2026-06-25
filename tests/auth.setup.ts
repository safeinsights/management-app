// storageState setup: persist each role's session to tests/.auth/<role>.json so specs
// can `test.use({ storageState })` and start already authenticated.
//
// Auth is faked in-app (src/lib/clerk-fake) and keyed off a single __e2e_role cookie, so
// "signing in" is just writing that cookie — no form, no SMS-MFA, no network. The
// signin/recovery specs still drive the real form (which the fake honors) for coverage.

import { test as setup } from '@playwright/test'
import { authFileFor, fs, goto, path, type TestingRole } from './e2e.helpers'

const ROLES: TestingRole[] = ['researcher', 'reviewer', 'admin']
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4100'

for (const role of ROLES) {
    setup(`authenticate ${role}`, async ({ context }) => {
        const authFile = authFileFor(role)
        await fs.promises.mkdir(path.dirname(authFile), { recursive: true })

        await context.addCookies([{ name: '__e2e_role', value: role, url: BASE_URL, sameSite: 'Lax' }])
        await context.storageState({ path: authFile })
    })
}

// Prime the heavy routes once before the spec projects run. A freshly-started server pays
// a one-time cost on the FIRST request to each route (module init, DB pool connect, S3
// client init); without this the first spec to hit each route can exceed its timeout,
// making the first suite run after a server start flaky. Warming here makes run 1 behave
// like every subsequent (warm) run.
const WARMUP_ROUTES = [
    '/researcher/dashboard',
    '/openstax-lab/dashboard',
    '/openstax/dashboard',
    '/reviewer-is-org-admin/admin/settings',
    '/reviewer-is-org-admin/admin/team',
    '/account/signin',
    '/account/mfa',
    '/dashboard',
]

setup('warm up routes', async ({ browser }) => {
    setup.setTimeout(180_000)
    const context = await browser.newContext({ storageState: authFileFor('admin') })
    const page = await context.newPage()
    try {
        for (const route of WARMUP_ROUTES) {
            await goto(page, route).catch(() => {})
        }
    } finally {
        await context.close()
    }
})
