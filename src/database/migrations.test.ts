import { readdirSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('migrations', () => {
    it('has no duplicate timestamps', () => {
        const files = readdirSync(path.join(__dirname, 'migrations')).filter((f) => f.endsWith('.ts'))
        const timestamps = files.map((f) => f.split('_')[0])
        const dupes = timestamps.filter((t, i) => timestamps.indexOf(t) !== i)
        expect(dupes, `Duplicate migration timestamps: ${dupes.join(', ')}`).toEqual([])
    })
})
