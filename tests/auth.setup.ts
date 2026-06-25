// storageState setup: sign in each test role exactly once and persist the Clerk
// session to tests/.auth/<role>.json. Specs then `test.use({ storageState })` to
// start already authenticated, so the expensive sign-in + SMS-MFA flow runs N
// times total (once per role) instead of once per role *switch* per test.
//
// The Clerk testing token is a per-page route handler (not part of storageState),
// so specs re-apply it via visitAsRole(); only the session cookies are restored
// from the saved state here.

import { test as setup } from '@playwright/test'
import {
    authFileFor,
    clerk,
    fs,
    goto,
    path,
    setupClerkTestingToken,
    signInAsRole,
    type TestingRole,
} from './e2e.helpers'

const ROLES: TestingRole[] = ['researcher', 'reviewer', 'admin']

for (const role of ROLES) {
    setup(`authenticate ${role}`, async ({ page }) => {
        const authFile = authFileFor(role)
        await fs.promises.mkdir(path.dirname(authFile), { recursive: true })

        await setupClerkTestingToken({ page })
        // Start from a known signed-out state so a stale session from a prior run
        // can't make us save the wrong user's storageState.
        await goto(page, '/account/signin')
        await clerk.signOut({ page }).catch(() => {})
        await goto(page, '/account/signin')

        await signInAsRole(page, role)

        await page.context().storageState({ path: authFile })
    })
}
