import 'dotenv/config' // read .env file before other imports, to match nextjs default
import { beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { testTransaction } from 'pg-transactional-tests'
import { createTempDir } from '@/tests/unit.helpers'
import fs from 'fs'
import { cleanup } from '@testing-library/react'

const Headers = new Map()

beforeAll(async () => {
    vi.mock('next/router', () => require('next-router-mock'))
    vi.mock('next/navigation', () => require('next-router-mock'))
    vi.mock('next/headers', async () => ({ headers: async () => Headers }))
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
