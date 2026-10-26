import { chromium, type FullConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { Routes } from '@/lib/routes/definitions'
import { authFileFor, type TestingRole } from './e2e.helpers'
import { ENCLAVE_SLUG, LAB_SLUG, REVIEWER_ADMIN_ORG_SLUG, seedLegalDocuments } from './e2e.seed'

const ROLES: TestingRole[] = ['researcher', 'reviewer', 'admin', 'legal']

const WARMUP_ROUTES = [
    Routes.orgDashboard({ orgSlug: LAB_SLUG }),
    Routes.orgDashboard({ orgSlug: ENCLAVE_SLUG }),
    Routes.adminSettings({ orgSlug: REVIEWER_ADMIN_ORG_SLUG }),
    Routes.adminTeam({ orgSlug: REVIEWER_ADMIN_ORG_SLUG }),
    Routes.adminLegal({ orgSlug: REVIEWER_ADMIN_ORG_SLUG }),
    Routes.accountSignin,
    Routes.accountMfa,
    Routes.dashboard,
    Routes.legal,
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

    for (const role of ROLES) {
        const file = authFileFor(role)
        await fs.promises.mkdir(path.dirname(file), { recursive: true })
        await fs.promises.writeFile(file, JSON.stringify(storageStateFor(role), null, 2))
    }

    // Cannot happen in a spec: legal documents are global, so publishing one mid-run would
    // block every other worker's user.
    await seedLegalDocuments()

    // Warms heavy routes once so the first spec to hit a cold server does not pay one-time init
    // (module load, DB pool, S3 client) inside its own timeout. Errors are ignored on purpose;
    // the specs re-assert everything.
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
