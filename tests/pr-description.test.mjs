import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkPrDescription, hasExistingStudiesLine } from './pr-description.mjs'

const template = readFileSync('.github/pull_request_template.md', 'utf8')
const migration = 'src/database/migrations/1787300000000_code_resubmission_note_rows.ts'

describe('hasExistingStudiesLine', () => {
    it.each([
        '- No runtime code changed. Existing studies: unaffected.',
        '- **Existing studies: not backfilled.** A study that predates the deploy keeps reading its code env live.',
        'Existing studies: no effect. An index includes the existing rows when Postgres builds it.',
        '**Existing studies: backfilled.** The migration records a visit at the deploy time.',
        '**Existing studies:** unaffected because only new rows use it',
        'Summary\r\n\r\nExisting studies: backfilled X\r\n',
    ])('accepts a filled-in line: %j', (body) => {
        expect(hasExistingStudiesLine(body)).toBe(true)
    })

    it.each([null, undefined, ''])('rejects an empty body: %j', (body) => {
        expect(hasExistingStudiesLine(body)).toBe(false)
    })

    it('rejects the untouched template', () => {
        expect(hasExistingStudiesLine(template)).toBe(false)
    })

    it.each([
        'Existing studies:\nThe migration backfills old rows.',
        'Existing studies:\r\nfoo',
        '<!-- Existing studies: backfilled X -->\n\nExisting studies:',
    ])('rejects a line with no text after the colon: %j', (body) => {
        expect(hasExistingStudiesLine(body)).toBe(false)
    })
})

describe('checkPrDescription', () => {
    it('passes a PR without migrations whatever the body says', () => {
        expect(checkPrDescription({ body: '', changedFiles: ['src/app/page.tsx'] })).toEqual({ ok: true })
    })

    it('does not count the migration guard test as a migration', () => {
        expect(checkPrDescription({ body: null, changedFiles: ['src/database/migrations.test.ts'] })).toEqual({
            ok: true,
        })
    })

    it('fails a migration PR without the line and names the migrations', () => {
        expect(
            checkPrDescription({
                body: '## Problem\n\nNotes were lost.',
                changedFiles: ['src/app/page.tsx', migration],
            }),
        ).toEqual({ ok: false, migrations: [migration] })
    })

    it('fails a migration PR that left the template untouched', () => {
        expect(checkPrDescription({ body: template, changedFiles: [migration] }).ok).toBe(false)
    })

    it('passes a migration PR with a filled-in line', () => {
        expect(
            checkPrDescription({
                body: 'Existing studies: backfilled the old notes into comment rows.',
                changedFiles: [migration],
            }),
        ).toEqual({ ok: true })
    })
})
