// OTTER-556: a late CODE-SCANNED webhook can land as statusChanges[0], so reading the topmost row
// would 404 a resubmittable study. The page gates on canResearcherResubmitCode instead.
import { describe, it, expect } from 'vitest'
import { db } from '@/database'
import type { StudyJobStatus } from '@/database/types'
import { insertTestStudyJobData, mockSessionWithTestData, renderWithProviders, screen } from '@/tests/unit.helpers'
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
            jobStatus: 'CODE-SUBMITTED',
        })

        // The decision, then a late CODE-SCANNED webhook that lands as statusChanges[0].
        await insertStatus(job.id, 'CODE-CHANGES-REQUESTED')
        await insertStatus(job.id, 'CODE-SCANNED')

        const page = await ResubmitStudyCodePage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        expect(page).toBeDefined()
    })

    it('labels Edit study code as STEP 3, the code step', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await insertStatus(job.id, 'CODE-CHANGES-REQUESTED')

        const page = await ResubmitStudyCodePage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })
        renderWithProviders(page!)

        expect(screen.getByText('STEP 3')).toBeInTheDocument()
        expect(screen.getByText('Edit study code')).toBeInTheDocument()
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
