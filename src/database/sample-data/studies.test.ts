import { describe, expect, it } from '@/tests/unit.helpers'
import { studyId } from './ids'
import { SAMPLE_STUDIES } from './studies'

describe('SAMPLE_STUDIES', () => {
    it('has 21 studies with unique numbers, ids and titles', () => {
        expect(SAMPLE_STUDIES).toHaveLength(21)
        expect(new Set(SAMPLE_STUDIES.map((s) => studyId(s.n))).size).toBe(21)
        expect(new Set(SAMPLE_STUDIES.map((s) => s.title)).size).toBe(21)
    })

    it('covers every researcher pill the rules can produce for a non-errored lab', () => {
        const pills = new Set(SAMPLE_STUDIES.map((s) => s.expectedPills.researcher))
        for (const pill of [
            'proposal-draft',
            'proposal-submitted',
            'proposal-needs-revision',
            'proposal-declined',
            'proposal-approved',
            'code-draft',
            'code-submitted',
            'code-needs-revision',
            'code-declined',
            'code-approved',
            'code-processing',
            'outputs-awaiting',
            'outputs-need-review',
            'outputs-reviewed',
        ]) {
            expect(pills).toContain(pill)
        }
    })

    it('starts each study at least 3 days ago so every event is in the past', () => {
        for (const spec of SAMPLE_STUDIES) expect(spec.daysAgo).toBeGreaterThanOrEqual(3)
    })
})
