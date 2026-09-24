import type { Kysely } from 'kysely'
import { db, describe, expect, insertTestStudyJobData, insertTestUser, it } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { insertCodeResubmissionNotes } from './migrations/1787300000000_code_resubmission_note_rows'

const EMPTY_BODY = { root: { type: 'root', children: [] } }

const CODE_CRITERIA = {
    proposalAlignment: 'yes',
    agreementCompliance: 'yes',
    privacyProtection: 'yes',
} as const

type Entry = { studyId: string; studyJobId: string; authorId: string; round: number }

const insertDecision = ({ studyId, studyJobId, authorId, round }: Entry) =>
    db
        .insertInto('studyReviewComment')
        .values({
            studyId,
            studyJobId,
            authorId,
            reviewKind: 'CODE',
            entryType: 'DECISION',
            decision: 'NEEDS-CLARIFICATION',
            body: EMPTY_BODY,
            criteria: CODE_CRITERIA,
            round,
        })
        .execute()

const insertNote = ({ studyId, studyJobId, authorId, round }: Entry) =>
    db
        .insertInto('studyReviewComment')
        .values({
            studyId,
            studyJobId,
            authorId,
            reviewKind: 'CODE',
            entryType: 'RESUBMISSION-NOTE',
            body: EMPTY_BODY,
            round,
        })
        .execute()

const notesOf = (studyJobId: string) =>
    db
        .selectFrom('studyReviewComment')
        .select(['authorId', 'round', 'body', 'createdAt', 'studyId'])
        .where('studyJobId', '=', studyJobId)
        .where('entryType', '=', 'RESUBMISSION-NOTE')
        .orderBy('round')
        .execute()

describe('code_resubmission_note_rows migration', () => {
    describe('one entry per round', () => {
        it('lets a note share its round with the decision on that round', async () => {
            const { study, job } = await insertTestStudyJobData({ jobStatus: 'CODE-SUBMITTED' })
            const entry = { studyId: study.id, studyJobId: job.id, authorId: study.researcherId, round: 2 }

            await insertDecision(entry)
            await insertNote(entry)

            expect(await notesOf(job.id)).toHaveLength(1)
        })

        it('rejects a second note for the same round', async () => {
            const { study, job } = await insertTestStudyJobData({ jobStatus: 'CODE-SUBMITTED' })
            const entry = { studyId: study.id, studyJobId: job.id, authorId: study.researcherId, round: 2 }

            await insertNote(entry)

            await expect(insertNote(entry)).rejects.toThrow(/study_review_comment_one_entry_per_round/)
        })

        // The OTTER-471 guard that the widened key must keep.
        it('still rejects a second decision for the same round', async () => {
            const { study, job } = await insertTestStudyJobData({ jobStatus: 'CODE-SUBMITTED' })
            const entry = { studyId: study.id, studyJobId: job.id, authorId: study.researcherId, round: 1 }

            await insertDecision(entry)

            await expect(insertDecision(entry)).rejects.toThrow(/study_review_comment_one_entry_per_round/)
        })
    })

    describe('backfill from study_job', () => {
        const body = JSON.parse(lexicalJson('addressed the feedback'))

        it('files the note under the round and the researcher who submitted it, at the time they did', async () => {
            const { study, job, org } = await insertTestStudyJobData({ jobStatus: 'CODE-SUBMITTED' })
            const { user: coauthor } = await insertTestUser({ org })
            const resubmittedAt = new Date('2026-02-01T00:00:00Z')
            await db
                .updateTable('jobStatusChange')
                .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
                .where('studyJobId', '=', job.id)
                .execute()
            await db
                .insertInto('jobStatusChange')
                .values([
                    {
                        studyJobId: job.id,
                        status: 'CODE-CHANGES-REQUESTED',
                        createdAt: new Date('2026-01-15T00:00:00Z'),
                    },
                    { studyJobId: job.id, status: 'CODE-SUBMITTED', userId: coauthor.id, createdAt: resubmittedAt },
                ])
                .execute()

            await insertCodeResubmissionNotes(db as unknown as Kysely<unknown>, [
                { studyJobId: job.id, round: 2, body },
            ])

            expect(await notesOf(job.id)).toEqual([
                { studyId: study.id, authorId: coauthor.id, round: 2, body, createdAt: resubmittedAt },
            ])
        })

        it('attributes a submission that carries no user to the study researcher', async () => {
            const { study, job } = await insertTestStudyJobData({ jobStatus: 'CODE-SUBMITTED' })
            const submittedAt = new Date('2026-02-15T00:00:00Z')
            await db
                .updateTable('jobStatusChange')
                .set({ userId: null, createdAt: submittedAt })
                .where('studyJobId', '=', job.id)
                .execute()

            await insertCodeResubmissionNotes(db as unknown as Kysely<unknown>, [
                { studyJobId: job.id, round: 2, body },
            ])

            expect(await notesOf(job.id)).toEqual([
                { studyId: study.id, authorId: study.researcherId, round: 2, body, createdAt: submittedAt },
            ])
        })

        it('dates a note on a job with no submission row by the job itself', async () => {
            const { study, job } = await insertTestStudyJobData({ jobStatus: 'CODE-SUBMITTED' })
            const jobCreatedAt = new Date('2026-01-01T00:00:00Z')
            await db.updateTable('studyJob').set({ createdAt: jobCreatedAt }).where('id', '=', job.id).execute()
            await db.deleteFrom('jobStatusChange').where('studyJobId', '=', job.id).execute()

            await insertCodeResubmissionNotes(db as unknown as Kysely<unknown>, [
                { studyJobId: job.id, round: 3, body },
            ])

            expect(await notesOf(job.id)).toEqual([
                { studyId: study.id, authorId: study.researcherId, round: 3, body, createdAt: jobCreatedAt },
            ])
        })

        it('writes nothing for no notes', async () => {
            await expect(insertCodeResubmissionNotes(db as unknown as Kysely<unknown>, [])).resolves.toBeUndefined()
        })
    })
})
