import { db, describe, expect, it, vi } from '@/tests/unit.helpers'
import { seed } from '../seeds/1793200000000_sample_studies'

describe('sample studies seed', () => {
    it('logs a failure instead of failing the migration', async () => {
        vi.stubEnv('ALLOW_TESTING_DATA', 'TRUE')
        vi.stubEnv('BUCKET_NAME', '')
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        // A schema that does not exist, so the first query fails in Postgres itself.
        await expect(seed(db.withSchema('no_such_schema'))).resolves.toBeUndefined()
        expect(error).toHaveBeenCalledWith(expect.stringContaining('relation "no_such_schema.'))
    })
})
