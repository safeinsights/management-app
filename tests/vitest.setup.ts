import 'dotenv/config' // read .env file before other imports, to match Next.js default
import { beforeAll, beforeEach, afterEach, afterAll, vi, Mock, expect } from 'vitest'
import { testTransaction } from 'pg-transactional-tests'
import { createTempDir } from '@/tests/unit.helpers'
import fs from 'fs'
import { ClerkProvider, useClerk } from '@clerk/nextjs'
import { cleanup } from '@testing-library/react'

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'
import * as matchers from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interface Assertion<T = any> extends jest.Matchers<void, T>, TestingLibraryMatchers<T, void> {}
}

expect.extend(matchers)

const Headers = new Map()

beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vi.mock('next/router', () => require('next-router-mock'))
    vi.mock('next/server', async (importOriginal) => ({
        ...(await importOriginal()),
        after: (cb: () => void) => cb(),
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
                return router.asPath
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

    vi.mock('@clerk/nextjs')
    vi.mock('@clerk/nextjs/server')

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
    ;(ClerkProvider as Mock).mockImplementation(({ children }: { children: React.ReactNode }) => {
        return children
    })
})

afterEach(async () => {
    Headers.clear()
    await testTransaction.rollback()
    await fs.promises.rm(tmpDir, { recursive: true })
    delete process.env.UPLOAD_TMP_DIRECTORY
    cleanup()
})

afterAll(async () => {
    await testTransaction.close()
})
