import { beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { testTransaction } from 'pg-transactional-tests'
import { createTempDir } from '@/tests/helpers'
import fs from 'fs'

const Headers = new Map()

beforeAll(async () => {
    vi.mock('next/router', () => require('next-router-mock'))
    vi.mock('next/navigation', () => require('next-router-mock'))
    vi.mock('next/headers', async () => ({ headers: () => Headers }))
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
})

afterAll(async () => {
    await testTransaction.close()
})
