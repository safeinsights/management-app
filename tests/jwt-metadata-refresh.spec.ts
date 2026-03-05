import 'dotenv/config'
import { db } from '@/database'
import { findOrCreateOrgMembership, findOrCreateSiUserId } from '@/server/mutations'
import { createClerkClient } from '@clerk/backend'
import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test, type Page } from './e2e.helpers'

type TempUserCredentials = {
    clerkUserId: string
    email: string
    password: string
}

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY
const clerk = CLERK_SECRET_KEY ? createClerkClient({ secretKey: CLERK_SECRET_KEY }) : null
const HAS_DB_CONFIG = Boolean(process.env.DATABASE_URL || process.env.DB_SECRET_ARN)

test.describe('JWT metadata refresh on sign-in', () => {
    test.describe.configure({ mode: 'serial', retries: 0 })

    test('loads org dashboard immediately after sign-in with stale metadata', async ({ page }) => {
        test.skip(!clerk, 'CLERK_SECRET_KEY is required for jwt metadata refresh e2e tests')
        test.skip(!HAS_DB_CONFIG, 'DATABASE_URL or DB_SECRET_ARN is required for jwt metadata refresh e2e tests')

        const tempUser = await createTempUserWithStaleJwtMetadata()

        try {
            await signInToOrgDashboard({
                page,
                email: tempUser.email,
                password: tempUser.password,
            })

            await page.waitForURL(/\/openstax-lab\/dashboard/, { timeout: 20_000 })
            await expect(page.getByTestId('new-study').first()).toBeVisible({ timeout: 20_000 })
            await expect(page.getByText(/Something Went Wrong/i)).not.toBeVisible()
        } finally {
            await deleteTempClerkUser(tempUser.clerkUserId)
        }
    })
})

async function createTempUserWithStaleJwtMetadata(): Promise<TempUserCredentials> {
    if (!clerk) {
        throw new Error('Missing Clerk client')
    }

    const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const email = buildDeterministicTestEmail(runId)
    const password = `SafeInsights-${runId}-Aa!`

    const clerkUser = await clerk.users.createUser({
        emailAddress: [email],
        password,
        firstName: 'Delete',
        lastName: 'Stale',
        skipPasswordChecks: true,
    })

    const primaryEmail = clerkUser.emailAddresses.find(
        (item) => item.emailAddress.toLowerCase() === email.toLowerCase(),
    )
    if (primaryEmail) {
        await clerk.emailAddresses.updateEmailAddress(primaryEmail.id, { verified: true })
    }

    const siUserId = await findOrCreateSiUserId(clerkUser.id, {
        firstName: 'JWT',
        lastName: 'Stale',
        email,
    })

    const org = await db
        .selectFrom('org')
        .select(['id', 'slug', 'name', 'type'])
        .where('slug', '=', 'openstax-lab')
        .executeTakeFirstOrThrow()

    await findOrCreateOrgMembership({ userId: siUserId, slug: org.slug, isAdmin: false })

    const staleMetadata = {
        format: 'v3',
        user: { id: siUserId },
        teams: null,
        orgs: {
            [org.slug]: {
                id: '00000000-0000-0000-0000-000000000000',
                slug: org.slug,
                name: org.name,
                type: org.type,
                isAdmin: false,
            },
        },
    }

    await clerk.users.updateUserMetadata(clerkUser.id, {
        publicMetadata: staleMetadata as unknown as UserPublicMetadata,
    })

    return {
        clerkUserId: clerkUser.id,
        email,
        password,
    }
}

function buildDeterministicTestEmail(runId: string): string {
    const seededEmail = process.env.CLERK_RESEARCHER_EMAIL
    if (!seededEmail || !seededEmail.includes('@')) {
        return `delete-jwt-stale-${runId}@example.com`
    }

    const [localPart, domain] = seededEmail.split('@')
    return `${localPart}+delete-jwt-stale-${runId}@${domain}`
}

async function signInToOrgDashboard({ page, email, password }: { page: Page; email: string; password: string }) {
    await setupClerkTestingToken({ page })
    await page.goto('/account/signin?redirect_url=%2Fopenstax-lab%2Fdashboard')
    await page.getByLabel('email').fill(email)
    await page.getByLabel('password').fill(password)
    await page.getByRole('button', { name: /login/i }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/account/signin'), { timeout: 30000 })
}

async function deleteTempClerkUser(clerkUserId: string) {
    if (!clerk) {
        return
    }

    try {
        await clerk.users.deleteUser(clerkUserId)
    } catch {
        return
    }
}
