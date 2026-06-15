// OTTER-556 follow-up: the resubmit page's eligibility gate must read the job's
// resubmittable status order-independently. jobStatusChange.createdAt defaults to now()
// (constant within a transaction) and v7 ids are not reliably monotonic within a
// millisecond, so a late CODE-SCANNED webhook can append *after* the decision and become
// statusChanges[0]. Reading the topmost row alone would fail canResubmitStudyCode and
// 404 the page even though the "Edit and resubmit" button (which uses the order-independent
// decision helper) correctly rendered.
import { describe, it, expect } from 'vitest'
import { db } from '@/database'
import type { StudyJobStatus } from '@/database/types'
import { insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'
import ResubmitStudyCodePage from './page'

const insertStatus = (studyJobId: string, status: StudyJobStatus) =>
    db.insertInto('jobStatusChange').values({ studyJobId, status }).execute()

describe('ResubmitStudyCodePage', () => {
    it('renders when CODE-CHANGES-REQUESTED is present even if a later CODE-SCANNED row sorts first', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
            // First status row on the job. Subsequent rows below get higher ids and sort
            // ahead of it in statusChanges (ordered by id desc).
            jobStatus: 'CODE-SUBMITTED',
        })

        // The decision, then a late CODE-SCANNED webhook appended afterward (highest id =>
        // statusChanges[0]). CODE-SCANNED is not in CODE_RESUBMITTABLE_JOB_STATUSES.
        await insertStatus(job.id, 'CODE-CHANGES-REQUESTED')
        await insertStatus(job.id, 'CODE-SCANNED')

        const page = await ResubmitStudyCodePage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        // notFound() is a no-op mock in the test env, so a gated-out page resolves to
        // undefined. A rendered page is defined.
        expect(page).toBeDefined()
    })

    it('returns notFound when no resubmittable status exists in the job history', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
        })
        await insertStatus(job.id, 'CODE-SCANNED')

        const page = await ResubmitStudyCodePage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        expect(page).toBeUndefined()
    })
})
