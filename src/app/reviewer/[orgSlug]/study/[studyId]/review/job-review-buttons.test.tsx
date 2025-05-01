import { describe, expect, it, vi, Mock } from 'vitest'
import { insertTestStudyJobData, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import { JobReviewButtons } from './job-review-buttons'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { latestJobForStudy } from '@/server/db/queries'
import * as actions from '@/server/actions/study-job.actions'
import { StudyJobStatus, StudyStatus } from '@/database/types'

vi.spyOn(actions, 'approveStudyJobResultsAction')
vi.spyOn(actions, 'rejectStudyJobResultsAction')

vi.mock('@/server/storage', () => ({
    storeStudyResultsFile: vi.fn(),
}))

describe('Study Results Approve/Reject buttons', async () => {
    const testResults = [{ path: 'test.csv', contents: new TextEncoder().encode('test123').buffer as ArrayBuffer }]

    const insertAndRender = async (studyStatus: StudyStatus) => {
        const { org } = await mockSessionWithTestData()
        const { latestJobithStatus: job } = await insertTestStudyJobData({ org, studyStatus })
        const helpers = renderWithProviders(<JobReviewButtons job={job} decryptedResults={testResults} />)
        return { ...helpers, job, org }
    }

    const clickNTest = async (btnLabel: string, action: Mock, statusChange: StudyJobStatus) => {
        const { getByRole, job, org } = await insertAndRender('PENDING-REVIEW')

        expect(screen.queryByText(/approved on/i)).toBeNull()

        const btn = getByRole('button', { name: btnLabel })
        fireEvent.click(btn)

        await waitFor(async () => {
            expect(action).toHaveBeenCalled()
            const latest = await latestJobForStudy(job.studyId, { orgSlug: org.slug })
            expect(latest?.latestStatus).toEqual(statusChange)
        })
    }

    it('renders the approve/reject buttons when there is an unreviewed job', async () => {
        await insertAndRender('PENDING-REVIEW')
        expect(screen.queryByRole('button', { name: 'Approve' })).toBeDefined()
        expect(screen.queryByRole('button', { name: 'Reject' })).toBeDefined()
    })

    it('renders the approved timestamp for an approved job', async () => {
        await insertAndRender('APPROVED')
        expect(screen.queryByText(/approved on/i)).toBeDefined()
    })

    it('renders the rejected timestamp for a rejected job', async () => {
        await insertAndRender('REJECTED')
        expect(screen.queryByText(/rejected on/i)).toBeDefined()
    })

    it('can approve results', async () => {
        await clickNTest('Approve', actions.approveStudyJobResultsAction as Mock, 'JOB-READY')
    })

    it('can reject results', async () => {
        await clickNTest('Reject', actions.rejectStudyJobResultsAction as Mock, 'RESULTS-REJECTED')
    })
})
