import { describe, expect, it } from '@/tests/unit.helpers'
import { DEFAULT_REF_IDS } from './refs'
import { personIds } from './extras'
import { SAMPLE_STUDIES } from './studies'
import { buildStudyRows, type BuildContext } from './build-rows'

const refs = {
    researcherId: DEFAULT_REF_IDS.researcherId,
    reviewerId: DEFAULT_REF_IDS.reviewerId,
    adminId: DEFAULT_REF_IDS.adminId,
    enclave: { id: DEFAULT_REF_IDS.enclaveId, slug: 'openstax' },
    lab: { id: DEFAULT_REF_IDS.labId, slug: 'openstax-lab' },
}
const ctx: BuildContext = {
    now: new Date('2026-10-28T12:00:00Z'),
    refs,
    people: personIds(refs),
    members: { researcher: [refs.researcherId], reviewer: [refs.reviewerId] },
}
const spec = (n: number) => SAMPLE_STUDIES.find((s) => s.n === n)!

describe('buildStudyRows', () => {
    it('puts every event in the past and in order', () => {
        for (const s of SAMPLE_STUDIES) {
            const times = buildStudyRows(s, ctx).statusChanges.map((c) => (c.createdAt as Date).getTime())
            expect([...times].sort((a, b) => a - b)).toEqual(times)
            for (const t of times) expect(t).toBeLessThan(ctx.now.getTime())
        }
    })

    it('records who acted on each status the way the app does', () => {
        const actors = Object.fromEntries(buildStudyRows(spec(15), ctx).statusChanges.map((c) => [c.status, c.userId]))
        expect(actors['CODE-SUBMITTED']).toBe(refs.researcherId)
        expect(actors['CODE-APPROVED']).toBe(refs.reviewerId)
        expect(actors['JOB-RUNNING']).toBeNull()
    })

    it('keeps a draft unsubmitted, unassigned and half filled', () => {
        const { study } = buildStudyRows(spec(1), ctx)
        expect(study).toMatchObject({ submittedAt: null, reviewerId: null, researchQuestions: null, impact: null })
    })

    it('writes one AI review and one code note per round for a resubmission', () => {
        const rows = buildStudyRows(spec(10), ctx)
        expect(rows.reviews.map((r) => r.round)).toEqual([1, 2])
        expect(rows.reviewComments.map((c) => [c.round, c.entryType])).toEqual([
            [1, 'DECISION'],
            [2, 'RESUBMISSION-NOTE'],
        ])
    })

    it('uploads code, scan log and agreement under the app paths', () => {
        const rows = buildStudyRows(spec(12), ctx)
        const paths = rows.uploads.map((u) => u.path)
        const job = `studies/openstax/${rows.study.id}/jobs/${rows.jobs[0].id}`
        expect(paths).toEqual(
            expect.arrayContaining([
                `${job}/code/main.py`,
                `${job}/code/helpers.py`,
                `${job}/results/security-scan-log.txt`,
                expect.stringMatching(/^legal\/SLA\//),
            ]),
        )
    })

    it('shares approved results with the lab and leaves pending ones unshared', () => {
        expect(buildStudyRows(spec(19), ctx).encrypted[0]).toMatchObject({
            fileType: 'ENCRYPTED-RESULT',
            sharedWithLab: true,
        })
        expect(buildStudyRows(spec(16), ctx).encrypted[0]).toMatchObject({ sharedWithLab: false })
        expect(buildStudyRows(spec(17), ctx).encrypted[0]).toMatchObject({ fileType: 'ENCRYPTED-CODE-RUN-LOG' })
    })

    it('acknowledges the agreement for each party on approved studies only', () => {
        expect(buildStudyRows(spec(12), ctx).agreement?.acknowledgements).toHaveLength(2)
        expect(buildStudyRows(spec(2), ctx).agreement).toBeNull()
    })
})
