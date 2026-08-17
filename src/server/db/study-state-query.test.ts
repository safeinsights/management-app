import { describe, expect, it } from 'vitest'
import { db } from '@/database'
import { insertTestStudyJobData, insertTestStudyOnly, setTestStudyStatus } from '@/tests/unit.helpers'
import {
    proposalFieldsDocName,
    proposalResubmissionNoteDocNameForVersion,
    proposalTextFieldDocName,
} from '@/lib/collaboration-documents'
import { rawStudyStateForStudy } from './study-state-query'

describe('rawStudyStateForStudy', () => {
    it('returns the study with its jobs, statuses, and files', async () => {
        const { study, job } = await insertTestStudyJobData({ studyStatus: 'APPROVED', jobStatus: 'CODE-SUBMITTED' })
        // add a second status row on the same job so we assert the full set comes back
        await db.insertInto('jobStatusChange').values({ status: 'CODE-APPROVED', studyJobId: job.id }).execute()

        const raw = await rawStudyStateForStudy(study.id)
        expect(raw).not.toBeNull()
        expect(raw!.status).toBe('APPROVED')
        expect(raw!.jobs.length).toBeGreaterThanOrEqual(1)
        const allStatuses = raw!.jobs.flatMap((j) => j.statusChanges.map((c) => c.status))
        expect(allStatuses).toContain('CODE-SUBMITTED')
        expect(allStatuses).toContain('CODE-APPROVED')
    })

    it('returns null for an unknown study id', async () => {
        expect(await rawStudyStateForStudy('01900000-0000-7000-8000-0000000000ff')).toBeNull()
    })

    // OTTER-572: the collaborative documents are the only trace of Step 2 edits that were never flushed
    // to the study columns, so the query has to report them.
    describe('hasStep2CollabDoc', () => {
        const insertDraft = async () => {
            const { study } = await insertTestStudyOnly()
            await setTestStudyStatus(study.id, 'DRAFT')
            return study
        }

        const insertYjsDoc = (studyId: string, name: string) =>
            db
                .insertInto('yjsDocument')
                .values({ name, studyId, data: Buffer.from([0]) })
                .execute()

        it('is false for a draft with no collaborative document', async () => {
            const study = await insertDraft()
            const raw = await rawStudyStateForStudy(study.id)
            expect(raw!.hasStep2CollabDoc).toBe(false)
        })

        it('is true once the proposal fields document exists', async () => {
            const study = await insertDraft()
            await insertYjsDoc(study.id, proposalFieldsDocName(study.id))

            const raw = await rawStudyStateForStudy(study.id)
            expect(raw!.hasStep2CollabDoc).toBe(true)
        })

        it('is true from a lexical field document alone', async () => {
            const study = await insertDraft()
            await insertYjsDoc(study.id, proposalTextFieldDocName(study.id, 'researchQuestions'))

            const raw = await rawStudyStateForStudy(study.id)
            expect(raw!.hasStep2CollabDoc).toBe(true)
        })

        it("does not read another study's documents", async () => {
            const study = await insertDraft()
            const other = await insertDraft()
            await insertYjsDoc(other.id, proposalFieldsDocName(other.id))

            const raw = await rawStudyStateForStudy(study.id)
            expect(raw!.hasStep2CollabDoc).toBe(false)
        })

        // The name and the study_id both have to point here. No writer can produce this row (the editor
        // service derives study_id from the same parsed name), so it stands in for the naming convention
        // drifting out from under the SQL: the fragment fails closed instead of matching across studies.
        it('ignores a document whose name matches but whose study_id belongs to another study', async () => {
            const study = await insertDraft()
            const other = await insertDraft()
            await insertYjsDoc(other.id, proposalFieldsDocName(study.id))

            const raw = await rawStudyStateForStudy(study.id)
            expect(raw!.hasStep2CollabDoc).toBe(false)
        })

        it('ignores documents that are not Step 2 proposal documents', async () => {
            const study = await insertDraft()
            await insertYjsDoc(study.id, `review-feedback-${study.id}-v1`)

            const raw = await rawStudyStateForStudy(study.id)
            expect(raw!.hasStep2CollabDoc).toBe(false)
        })

        // The resubmission note shares the `proposal-<studyId>-` prefix but is written on the
        // change-requested resubmit screen, not on Step 2, so a prefix match would misreport it.
        it('ignores a resubmission-note document despite its proposal prefix', async () => {
            const study = await insertDraft()
            await insertYjsDoc(study.id, proposalResubmissionNoteDocNameForVersion(study.id, 1))

            const raw = await rawStudyStateForStudy(study.id)
            expect(raw!.hasStep2CollabDoc).toBe(false)
        })
    })
})
