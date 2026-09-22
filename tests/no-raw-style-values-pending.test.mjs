import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PENDING_RAW_STYLE_FILES } from './no-raw-style-values-pending.mjs'

// A deleted file has to leave the list, or its per-file `warn` outlives the code it covered.
describe('pending raw-style files', () => {
    it('lists at least one file while the migration is open', () => {
        expect(PENDING_RAW_STYLE_FILES.length).toBeGreaterThan(0)
    })

    it.each(PENDING_RAW_STYLE_FILES)('%s still exists', (path) => {
        expect(existsSync(path)).toBe(true)
    })
})
