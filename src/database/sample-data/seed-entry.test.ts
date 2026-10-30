import type { Kysely } from 'kysely'
import type { DB } from '@/database/types'
import { describe, expect, it, vi } from '@/tests/unit.helpers'
import { seed } from '../seeds/1793200000000_sample_studies'

describe('sample studies seed', () => {
    it('logs a failure instead of failing the migration', async () => {
        vi.stubEnv('ALLOW_TESTING_DATA', 'TRUE')
        vi.stubEnv('BUCKET_NAME', '')
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const brokenDb = {
            selectFrom: () => {
                throw new Error('database is having a day')
            },
        } as unknown as Kysely<DB>

        await expect(seed(brokenDb)).resolves.toBeUndefined()
        expect(error).toHaveBeenCalledWith(expect.stringContaining('database is having a day'))
    })
})
