import 'dotenv/config' // read .env file before other imports, to match Next.js default
import { beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { testTransaction } from 'pg-transactional-tests'
import { createTempDir } from '@/tests/unit.helpers'
import fs from 'fs'
import { cleanup } from '@testing-library/react'

const Headers = new Map()

beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vi.mock('next/router', () => require('next-router-mock'))

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
            useSearchParams: () => {
                const router = useRouter()
                const path = router.query
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
