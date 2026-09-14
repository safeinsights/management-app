import { db, describe, expect, insertTestOrg, insertTestStudyData, it } from '@/tests/unit.helpers'
import type { Kysely } from 'kysely'
import { up } from './migrations/1786500000000_outputs_decision_round'

const EMPTY_BODY = { root: { type: 'root', children: [] } }

const CODE_CRITERIA = {
    proposalAlignment: 'yes',
    agreementCompliance: 'yes',
    securityChecks: 'yes',
    privacyProtection: 'yes',
} as const

type DecisionFixture = { studyId: string; studyJobId: string; authorId: string; round: number; createdAt: Date }

const insertOutputsDecision = (fixture: DecisionFixture) =>
    db
        .insertInto('studyReviewComment')
        .values({ ...fixture, reviewKind: 'RESULTS', entryType: 'DECISION', decision: 'APPROVE', body: EMPTY_BODY })
        .returning('id')
        .executeTakeFirstOrThrow()

const roundOf = async ({ id }: { id: string }) => {
    const row = await db.selectFrom('studyReviewComment').select('round').where('id', '=', id).executeTakeFirstOrThrow()
    return row.round
}

describe('outputs_decision_round migration', () => {
    it('renumbers outputs decisions per study and leaves code rounds alone', async () => {
        const org = await insertTestOrg()
        const { studyId, jobIds, researcherId } = await insertTestStudyData({ org })

        // Two decisions on one job: shifting 2,3 to 1,2 walks over this job's own old value, which the
        // unique constraint rejects unless the migration parks the rows first.
        const first = await insertOutputsDecision({
            studyId,
            studyJobId: jobIds[0],
            authorId: researcherId,
            round: 2,
            createdAt: new Date('2026-01-01T00:00:00Z'),
        })
        const second = await insertOutputsDecision({
            studyId,
            studyJobId: jobIds[0],
            authorId: researcherId,
            round: 3,
            createdAt: new Date('2026-02-01T00:00:00Z'),
        })
        const third = await insertOutputsDecision({
            studyId,
            studyJobId: jobIds[1],
            authorId: researcherId,
            round: 4,
            createdAt: new Date('2026-03-01T00:00:00Z'),
        })

        const codeReview = await db
            .insertInto('studyReviewComment')
            .values({
                studyId,
                studyJobId: jobIds[0],
                authorId: researcherId,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: EMPTY_BODY,
                criteria: CODE_CRITERIA,
                round: 2,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const other = await insertTestStudyData({ org })
        const otherStudyDecision = await insertOutputsDecision({
            studyId: other.studyId,
            studyJobId: other.jobIds[0],
            authorId: other.researcherId,
            round: 5,
            createdAt: new Date('2026-01-15T00:00:00Z'),
        })

        await up(db as unknown as Kysely<unknown>)

        expect(await roundOf(first)).toBe(1)
        expect(await roundOf(second)).toBe(2)
        expect(await roundOf(third)).toBe(3)
        expect(await roundOf(codeReview)).toBe(2)
        expect(await roundOf(otherStudyDecision)).toBe(1)
    })
})
