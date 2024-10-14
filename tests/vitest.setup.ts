import { beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { testTransaction } from 'pg-transactional-tests'
import { createTempDir } from '@/tests/helpers'
import fs from 'fs'

const Headers = new Map()

beforeAll(() => {
    vi.mock('next/router', () => require('next-router-mock'))
    vi.mock('next/navigation', () => require('next-router-mock'))
    vi.mock('next/headers', async () => ({ headers: () => Headers }))
})

let tmpDir: string = ''

beforeEach(async () => {
    testTransaction.start()
    tmpDir = await createTempDir()
    process.env.UPLOAD_TMP_DIRECTORY = tmpDir
})

afterEach(async () => {
    Headers.clear()
    testTransaction.rollback()
    await fs.promises.rm(tmpDir, { recursive: true })
    delete process.env.UPLOAD_TMP_DIRECTORY
})
