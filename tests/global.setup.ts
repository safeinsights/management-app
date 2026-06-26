// Playwright globalSetup: runs once (in the main process, after the webServer is up)
// before any spec. Replaces the former `auth setup` *project* — which spun up a whole
// worker pool + browser-launch phase as a barrier — with a single fast pass:
//
//   1. Write each role's storageState (just the __e2e_role cookie) directly as JSON. Auth
//      is faked, so "signing in" is writing that cookie — no browser needed.
//   2. Warm the heavy routes once with a single browser so the first spec to hit a route
//      on a cold server doesn't pay one-time init (module load, DB pool, S3 client) and
//      risk its timeout.
//
// Removing the separate project removes a full worker-pool/barrier phase from the run.

import { chromium, type FullConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { authFileFor, type TestingRole } from './e2e.helpers'

const ROLES: TestingRole[] = ['researcher', 'reviewer', 'admin']

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

function storageStateFor(role: TestingRole) {
    return {
        cookies: [
            {
                name: '__e2e_role',
                value: role,
                domain: 'localhost',
                path: '/',
                expires: -1,
                httpOnly: false,
                secure: false,
                sameSite: 'Lax' as const,
            },
        ],
        origins: [],
    }
}

export default async function globalSetup(config: FullConfig) {
    const baseURL = config.projects[0]?.use?.baseURL ?? process.env.E2E_BASE_URL ?? 'http://localhost:4100'

    // 1. Write storageState files directly (no browser).
    for (const role of ROLES) {
        const file = authFileFor(role)
        await fs.promises.mkdir(path.dirname(file), { recursive: true })
        await fs.promises.writeFile(file, JSON.stringify(storageStateFor(role), null, 2))
    }

    // 2. Warm routes with a single admin-cookie browser context.
    const browser = await chromium.launch()
    try {
        const context = await browser.newContext({ storageState: authFileFor('admin') })
        const page = await context.newPage()
        for (const route of WARMUP_ROUTES) {
            await page
                .goto(new URL(route, baseURL).href, { waitUntil: 'domcontentloaded' })
                .then(() => page.waitForFunction(() => (window as { isReactHydrated?: boolean }).isReactHydrated))
                .catch(() => {})
        }
        await context.close()
    } finally {
        await browser.close()
    }
}
