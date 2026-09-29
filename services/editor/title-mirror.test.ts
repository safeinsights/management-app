import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { PROPOSAL_FIELDS_MAP_NAME } from '../../src/lib/collaboration-documents.js'
import type { ParsedDocumentName } from './auth.js'
import { mirrorProposalTitleToStudy, readTitleFromFieldsDoc } from './title-mirror.js'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function fieldsDocWithTitle(title: unknown): Y.Doc {
    const doc = new Y.Doc()
    doc.getMap(PROPOSAL_FIELDS_MAP_NAME).set('title', title)
    return doc
}

function fakeDb() {
    const query = vi.fn(async (_text: string, _values?: unknown[]) => ({ rows: [] as never[], rowCount: 0 }))
    return { query, calls: () => query.mock.calls }
}

describe('readTitleFromFieldsDoc', () => {
    it('returns the trimmed title', () => {
        expect(readTitleFromFieldsDoc(fieldsDocWithTitle('  Research study  '))).toBe('Research study')
    })

    it('returns null for a blank/whitespace title', () => {
        expect(readTitleFromFieldsDoc(fieldsDocWithTitle('   '))).toBeNull()
        expect(readTitleFromFieldsDoc(fieldsDocWithTitle(''))).toBeNull()
    })

    it('returns null when the title key is absent', () => {
        expect(readTitleFromFieldsDoc(new Y.Doc())).toBeNull()
    })
})

describe('mirrorProposalTitleToStudy', () => {
    const fieldsDoc: ParsedDocumentName = { kind: 'proposal-fields', studyId: STUDY_ID }

    it('is a no-op for non proposal-fields documents', async () => {
        const db = fakeDb()
        const textDoc: ParsedDocumentName = { kind: 'proposal-text', studyId: STUDY_ID, slug: 'impact' }
        await mirrorProposalTitleToStudy(textDoc, fieldsDocWithTitle('ignored'), STUDY_ID, db)
        expect(db.calls()).toHaveLength(0)
    })

    it('writes the trimmed title to study.title', async () => {
        const db = fakeDb()
        await mirrorProposalTitleToStudy(fieldsDoc, fieldsDocWithTitle('  My draft  '), STUDY_ID, db)
        expect(db.calls()).toHaveLength(1)
        const [sql, params] = db.calls()[0]
        expect(sql).toContain('UPDATE study')
        expect(params).toEqual([STUDY_ID, 'My draft'])
    })

    // OTTER-690: Step 1 owns study.title on a DRAFT. Legacy fields-docs still carry a `title`
    // key the DRAFT client no longer maintains, so a mirror that still covered DRAFT would flush
    // a blank or stale collaborative value over the Step 1 one.
    it('only ever touches CHANGE-REQUESTED rows, never DRAFT ones', async () => {
        const db = fakeDb()
        await mirrorProposalTitleToStudy(fieldsDoc, fieldsDocWithTitle('My draft'), STUDY_ID, db)
        const [sql] = db.calls()[0]
        expect(sql).toContain("status = 'CHANGE-REQUESTED'")
        expect(sql).not.toContain("'DRAFT'")
    })

    // A NULL title on a CHANGE-REQUESTED row violates study_title_required_when_not_draft, so a
    // blank collaborative title leaves the stored one alone rather than clearing it.
    it('does not write at all when the collaborative title is blank', async () => {
        const db = fakeDb()
        await mirrorProposalTitleToStudy(fieldsDoc, fieldsDocWithTitle('   '), STUDY_ID, db)
        expect(db.calls()).toHaveLength(0)
    })

    it('does not write when the title key is absent', async () => {
        const db = fakeDb()
        await mirrorProposalTitleToStudy(fieldsDoc, new Y.Doc(), STUDY_ID, db)
        expect(db.calls()).toHaveLength(0)
    })
})
