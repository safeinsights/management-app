import { describe, expect, it, mockStudyRow } from '@/tests/unit.helpers'
import { PILL_PRESENTATION } from '@/lib/status-labels'
import { buildRowModel, type RowModel } from './row-model'
import { DEFAULT_SORT, STATUS_LIFECYCLE, nextSort, sortRows } from './sort'
import type { StudyRow } from './types'

let seq = 0
const row = (overrides: Partial<StudyRow>): RowModel => {
    seq += 1
    return buildRowModel(
        mockStudyRow({ id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, ...overrides }),
        'researcher',
        { orgSlug: 'lab' },
    )
}
const titles = (rows: RowModel[]) => rows.map((r) => r.title)

describe('sortRows', () => {
    it('sorts newest first by default', () => {
        const rows = [
            row({ title: 'old', lastUpdatedAt: new Date('2026-01-01') }),
            row({ title: 'new', lastUpdatedAt: new Date('2026-03-01') }),
        ]
        expect(titles(sortRows(rows, DEFAULT_SORT))).toEqual(['new', 'old'])
    })

    it('sorts titles alphabetically, ignoring case', () => {
        const rows = [row({ title: 'cherry' }), row({ title: 'apple' }), row({ title: 'Banana' })]
        expect(titles(sortRows(rows, { column: 'title', direction: 'asc' }))).toEqual(['apple', 'Banana', 'cherry'])
        expect(titles(sortRows(rows, { column: 'title', direction: 'desc' }))).toEqual(['cherry', 'Banana', 'apple'])
    })

    it('puts placeholders after names in both directions', () => {
        const rows = [
            row({ title: 'draft', status: 'DRAFT' }),
            row({ title: 'to-b', status: 'PENDING-REVIEW', reviewingEnclaveName: 'Beta' }),
            row({ title: 'to-a', status: 'PENDING-REVIEW', reviewingEnclaveName: 'Alpha' }),
        ]
        expect(titles(sortRows(rows, { column: 'submittedTo', direction: 'asc' }))).toEqual(['to-a', 'to-b', 'draft'])
        expect(titles(sortRows(rows, { column: 'submittedTo', direction: 'desc' }))).toEqual(['to-b', 'to-a', 'draft'])
    })

    it('breaks ties by newest Last updated', () => {
        const rows = [
            row({ title: 'older', lastUpdatedAt: new Date('2026-01-01') }),
            row({ title: 'newer', lastUpdatedAt: new Date('2026-02-01') }),
        ]
        expect(titles(sortRows(rows, { column: 'status', direction: 'asc' }))).toEqual(['newer', 'older'])
    })

    it('sorts Status by lifecycle position', () => {
        const rows = [
            row({
                title: 'outputs',
                status: 'APPROVED',
                jobStatusChanges: [
                    { status: 'CODE-SUBMITTED' },
                    { status: 'CODE-APPROVED' },
                    { status: 'RUN-COMPLETE' },
                    { status: 'FILES-APPROVED' },
                    { status: 'RESULTS-VIEWED' },
                ],
            }),
            row({ title: 'draft', status: 'DRAFT' }),
            row({ title: 'code', status: 'APPROVED', jobStatusChanges: [{ status: 'CODE-SUBMITTED' }] }),
        ]
        expect(titles(sortRows(rows, { column: 'status', direction: 'asc' }))).toEqual(['draft', 'code', 'outputs'])
    })
})

describe('STATUS_LIFECYCLE', () => {
    it('covers every status badge exactly once', () => {
        expect([...STATUS_LIFECYCLE].sort()).toEqual(Object.keys(PILL_PRESENTATION).sort())
    })
})

describe('nextSort', () => {
    it('sorts a new column ascending, then flips it', () => {
        const asc = nextSort(DEFAULT_SORT, 'title')
        expect(asc).toEqual({ column: 'title', direction: 'asc' })
        expect(nextSort(asc, 'title')).toEqual({ column: 'title', direction: 'desc' })
    })

    it('returns to the default on any Last updated click', () => {
        expect(nextSort({ column: 'title', direction: 'desc' }, 'lastUpdated')).toEqual(DEFAULT_SORT)
        expect(nextSort(DEFAULT_SORT, 'lastUpdated')).toEqual(DEFAULT_SORT)
    })
})
