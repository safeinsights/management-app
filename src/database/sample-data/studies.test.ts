import { describe, expect, it } from '@/tests/unit.helpers'
import { projectStudyState, resolvePillId } from '@/lib/study-screen'
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

// Mirrors the filter in src/app/api/studies/ready/route.ts: an enclave runner polling the org would
// pick these jobs up and try to run an image that does not exist.
const offeredToRunner = (statuses: string[]) =>
    statuses.some((s) => s === 'JOB-READY' || s === 'JOB-RUNNING') &&
    !statuses.some((s) => ['JOB-ERRORED', 'RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED'].includes(s))

describe('jobs an enclave runner can see', () => {
    it('is only #15, whose code-running pill needs a JOB-RUNNING row', () => {
        const offered = SAMPLE_STUDIES.filter((s) => s.status === 'APPROVED' && offeredToRunner(s.job?.statuses ?? []))
        expect(offered.map((s) => s.n)).toEqual([15])
    })
})

// The dashboard test reads rows a DB may hold from an older spec, since the seed never rewrites a
// study. This checks the specs themselves against the real pill rules.
describe('spec statuses', () => {
    it.each(SAMPLE_STUDIES.map((s) => [s.n, s] as const))('#%i projects to its expected pills', (_, spec) => {
        const text = { root: { children: [] } }
        const state = projectStudyState({
            status: spec.status,
            approvedAt: null,
            rejectedAt: null,
            researcherAgreementsAckedAt: null,
            reviewerAgreementsAckedAt: null,
            proposalResubmissionNoteDraft: null,
            codeResubmissionNoteDraft: null,
            hasStep2CollabDoc: false,
            piUserId: 'pi',
            datasets: ['Student Activity Logs'],
            researchQuestions: spec.halfFilled ? null : text,
            projectSummary: text,
            impact: spec.halfFilled ? null : text,
            additionalNotes: null,
            jobs: spec.job ? [{ id: '0', statusChanges: spec.job.statuses.map((status) => ({ status })) }] : [],
        })
        expect(resolvePillId('researcher', state)).toBe(spec.expectedPills.researcher)
        if (spec.expectedPills.reviewer) expect(resolvePillId('reviewer', state)).toBe(spec.expectedPills.reviewer)
    })
})
