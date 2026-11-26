import { describe, expect, it } from '@/tests/unit.helpers'
import { buildStudyEvent } from './study-events'

const studyId = '01a21993-30c8-76a2-b7e4-2f16e59254c0'

describe('buildStudyEvent', () => {
    it('builds the JSON payload of a study change event', () => {
        expect(JSON.parse(buildStudyEvent({ studyId, change: 'study-status' }))).toEqual({
            type: 'study-changed',
            studyId,
            change: 'study-status',
        })
    })

    // Postgres would refuse it inside the write's transaction, so the error names the cause.
    it('refuses a payload over the NOTIFY limit', () => {
        expect(() =>
            buildStudyEvent({ studyId, change: 'code-submitted', submittedBy: { name: 'x'.repeat(8000) } }),
        ).toThrow(/over the NOTIFY limit/)
    })
})
