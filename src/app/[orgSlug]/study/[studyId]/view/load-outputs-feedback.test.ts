import { db, describe, expect, insertTestStudyJobData, it, mockSessionWithTestData } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { loadOutputsFeedback } from './load-outputs-feedback'

describe('loadOutputsFeedback', () => {
    it('returns entries on success', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({ org })
        const decision = await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'RESULTS',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: JSON.parse(lexicalJson('outputs look fine')),
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const result = await loadOutputsFeedback(study.id)

        expect(result.feedbackLoadError).toBe(false)
        expect(result.entries).toEqual([
            expect.objectContaining({ id: decision.id, entryType: 'REVIEWER-FEEDBACK', decision: 'APPROVE' }),
        ])
    })

    it('returns empty entries and feedbackLoadError when the action fails', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })
        // Another org's study, which the session may not view.
        const { study } = await insertTestStudyJobData()

        const result = await loadOutputsFeedback(study.id)

        expect(result.feedbackLoadError).toBe(true)
        expect(result.entries).toEqual([])
    })
})
