import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')
const migrationFiles = () => readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.ts'))

// OTTER-794: earlier migrations predate the retroactive-change rule; see docs/retroactive-changes.md.
const RETROACTIVE_RULE_SINCE = 1787300000000

// Widens a study-family table or enum: existing studies would otherwise fall behind new ones.
const WIDENS_STUDY_SHAPE = [
    /alterTable\(['"](study\w*|job_status_change)['"]\)[\s\S]*?\.addColumn\(/,
    /createTable\(['"](study\w*|job_status_change)['"]\)/,
    /ALTER TABLE\s+(study\w*|job_status_change)\s+ADD COLUMN/i,
    /ALTER TYPE\s+(study\w*|job_status)\s+ADD VALUE/i,
]
// ponytail: file-level regex, so a backfill in down() or on an unrelated table also satisfies it.
// Reviewers read the migration anyway; tighten to per-statement parsing if it ever lets one slip.
const BACKFILLS = /\.updateTable\(|\.insertInto\(|\bUPDATE\s|\bINSERT INTO\s/
const OPT_OUT = /no backfill:/

describe('migrations', () => {
    it('has no duplicate timestamps', () => {
        const files = migrationFiles()
        const timestamps = files.map((f) => f.split('_')[0])
        const dupes = timestamps.filter((t, i) => timestamps.indexOf(t) !== i)
        expect(dupes, `Duplicate migration timestamps: ${dupes.join(', ')}`).toEqual([])
    })

    it('brings existing studies along when widening a study-family table or enum', () => {
        const offenders = migrationFiles()
            .filter((f) => Number(f.split('_')[0]) >= RETROACTIVE_RULE_SINCE)
            .filter((f) => {
                const source = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')
                const widens = WIDENS_STUDY_SHAPE.some((re) => re.test(source))
                return widens && !BACKFILLS.test(source) && !OPT_OUT.test(source)
            })
        expect(
            offenders,
            'Backfill existing rows, or add a `// no backfill: <why existing studies are unaffected>` comment (docs/retroactive-changes.md)',
        ).toEqual([])
    })
})
