import 'dotenv/config' // read .env file before other imports, to match Next.js default
import { beforeAll, beforeEach, afterEach, afterAll, vi, Mock, expect } from 'vitest'

// `server-only` throws on import outside React Server Component contexts. Tests run
// in a Node + happy-dom context that vitest treats as client, so any test file that
// transitively imports src/server/config.ts would explode at parse time. Stub it.
vi.mock('server-only', () => ({}))
import { testTransaction } from 'pg-transactional-tests'
import { localStorageContext } from '@/server/actions/action'
import { createTempDir } from '@/tests/unit.helpers'
import fs from 'fs'
import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/nextjs'
import { cleanup } from '@testing-library/react'

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'
import * as matchers from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interface Assertion<T = any> extends jest.Matchers<void, T>, TestingLibraryMatchers<T, void> {}
}

expect.extend(matchers)

const Headers = new Map()

// Deferred callbacks (via next/server's `after`) are fire-and-forget async operations.
// In production they run after the response. In tests we must:
//  1. Track their promises so we can await them before rolling back the transaction
//  2. Mock `sleep` to be instant (otherwise simulateJobScan waits 1s, completeFakeCodeScan waits 30s)
// Without this, callbacks outlive the test transaction and cause FK violations — non-deterministically
// depending on machine speed (works on fast local machines, fails on slow CI).
const pendingDeferredCallbacks: Promise<unknown>[] = []

function runDeferredTestCallback(cb: () => void | Promise<void>) {
    localStorageContext.run({ db: undefined as never }, () => {
        const result = cb()
        if (result && typeof (result as Promise<unknown>).then === 'function') {
            pendingDeferredCallbacks.push(result as Promise<unknown>)
        }
    })
}

beforeAll(async () => {
    // Defense layer: clear Clerk credentials to prevent real API calls if mocks fail
    delete process.env.CLERK_SECRET_KEY
    delete process.env.CLERK_PUBLISHABLE_KEY
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vi.mock('next/router', () => require('next-router-mock'))
    vi.mock('next/server', async (importOriginal) => ({
        ...(await importOriginal()),
        after: runDeferredTestCallback,
    }))

    // https://github.com/scottrippey/next-router-mock/issues/67#issuecomment-1564906960
    vi.mock('next/navigation', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mockRouter = require('next-router-mock')
        const useRouter = mockRouter.useRouter

        return {
            ...mockRouter,
            notFound: vi.fn(),
            redirect: vi.fn().mockImplementation((url: string) => {
                mockRouter.memoryRouter.setCurrentUrl(url)
            }),
            usePathname: () => {
                const router = useRouter()
                return router.asPath.split('?')[0]
            },
            useParams: vi.fn(() => ({})),
            useSearchParams: () => {
                const router = useRouter()
                const path = router.query
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return new URLSearchParams(path as any)
            },
        }
    })
    vi.mock('next/cache')
    vi.mock('next/headers', async () => ({ headers: async () => Headers }))

    // Clerk SDK mocks - configured via mockClerkSession() in unit.helpers.tsx
    vi.mock('@clerk/nextjs')
    vi.mock('@clerk/nextjs/server')

    // Partial mock: only mock Clerk mutation functions, keep read functions real
    vi.mock('@/server/clerk', async (importOriginal) => ({
        ...(await importOriginal()),
        updateClerkUserName: vi.fn(),
        updateClerkUserMetadata: vi.fn(),
        findOrCreateClerkOrganization: vi.fn(),
    }))

    vi.mock('@/components/page-breadcrumbs', () => ({
        OrgBreadcrumbs: () => null,
        ResearcherBreadcrumbs: () => null,
        PageBreadcrumbs: () => null,
    }))

    vi.mock('@mantine/notifications', () => ({
        notifications: {
            show: vi.fn(),
            hide: vi.fn(),
        },
        showNotification: vi.fn(),
        Notifications: () => null,
    }))

    // Make sleep instant so deferred simulation callbacks (simulateJobScan, completeFakeCodeScan)
    // complete within the test transaction instead of firing real 1s/30s timers.
    vi.mock('@/lib/utils', async (importOriginal) => ({
        ...(await importOriginal()),
        sleep: vi.fn().mockResolvedValue(undefined),
    }))

    testTransaction.start()
})

let tmpDir: string = ''

beforeEach(async () => {
    testTransaction.start()
    tmpDir = await createTempDir()
    process.env.UPLOAD_TMP_DIRECTORY = tmpDir
    ;(useClerk as Mock).mockImplementation(() => ({
        signOut: vi.fn(),
        openUserProfile: vi.fn(),
    }))
    ;(useAuth as Mock).mockReturnValue({ userId: null, isLoaded: true })
    ;(useUser as Mock).mockReturnValue({ user: null, isLoaded: false, isSignedIn: false })
    ;(ClerkProvider as Mock).mockImplementation(({ children }: { children: React.ReactNode }) => {
        return children
    })
})

afterEach(async () => {
    Headers.clear()
    await Promise.allSettled(pendingDeferredCallbacks)
    pendingDeferredCallbacks.length = 0
    await testTransaction.rollback()
    await fs.promises.rm(tmpDir, { recursive: true })
    delete process.env.UPLOAD_TMP_DIRECTORY
    cleanup()
})

afterAll(async () => {
    await testTransaction.close()
})
