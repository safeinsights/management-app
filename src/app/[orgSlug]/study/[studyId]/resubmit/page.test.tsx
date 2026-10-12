// OTTER-556: a late CODE-SCANNED webhook can land as statusChanges[0], so reading the topmost row
// would 404 a resubmittable study. The page gates on canResearcherResubmitCode instead.
import { describe, it, expect } from 'vitest'
import { db } from '@/database'
import type { StudyJobStatus } from '@/database/types'
import {
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    within,
} from '@/tests/unit.helpers'
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

    it('renders the STEP 3 "Edit code" section header without the study title', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await insertStatus(job.id, 'CODE-CHANGES-REQUESTED')

        const page = await ResubmitStudyCodePage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        renderWithProviders(page!)
        const header = screen.getByTestId('proposal-section-header')
        expect(header).toHaveTextContent('STEP 3')
        expect(header).toHaveTextContent('Edit code')
        expect(header).not.toHaveTextContent(study.title!)
    })

    it('renders the Code files section with the secondary text unique to this page', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await insertStatus(job.id, 'CODE-CHANGES-REQUESTED')

        const page = await ResubmitStudyCodePage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        renderWithProviders(page!)
        // Nested in the step header's card rather than a card of its own, per the design.
        const section = within(screen.getByTestId('proposal-section-header')).getByTestId('your-files-section')
        expect(section).toHaveTextContent('Code files')
        expect(section).toHaveTextContent(
            'View and manage your code files. You can update files, delete them, or upload new ones.',
        )
        expect(within(section).queryByTestId('your-files-divider')).not.toBeInTheDocument()
    })

    it('offers View outputs when Edit code reopens the round from the outputs step', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
        })
        await insertStatus(job.id, 'CODE-APPROVED')
        await insertStatus(job.id, 'RUN-COMPLETE')
        await insertStatus(job.id, 'FILES-REJECTED')

        const page = await ResubmitStudyCodePage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        renderWithProviders(page!)
        expect(screen.getByRole('button', { name: 'View outputs' })).toBeInTheDocument()
    })

    it('hides View outputs when Edit code follows a code revision request', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await insertStatus(job.id, 'CODE-CHANGES-REQUESTED')

        const page = await ResubmitStudyCodePage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        renderWithProviders(page!)
        expect(screen.getByRole('button', { name: 'Resubmit code for review' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'View outputs' })).not.toBeInTheDocument()
    })

    it('hides View outputs when a newer round asks for code changes after an outputs decision', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
        })
        const second = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()
        await insertStatus(second.id, 'CODE-SUBMITTED')

        // The projection reads the round with the highest id. Two inserts can share a v7
        // millisecond, so order the rounds by id instead of by insertion.
        const [olderRound, newerRound] = [job.id, second.id].sort()
        await insertStatus(olderRound, 'CODE-APPROVED')
        await insertStatus(olderRound, 'RUN-COMPLETE')
        await insertStatus(olderRound, 'FILES-REJECTED')
        await insertStatus(newerRound, 'CODE-CHANGES-REQUESTED')

        const page = await ResubmitStudyCodePage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        renderWithProviders(page!)
        expect(screen.getByRole('button', { name: 'Resubmit code for review' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'View outputs' })).not.toBeInTheDocument()
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
