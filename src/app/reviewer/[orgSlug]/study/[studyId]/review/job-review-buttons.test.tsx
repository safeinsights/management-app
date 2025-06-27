import { describe, expect, it, Mock, vi } from 'vitest'
import { insertTestStudyJobData, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import { JobReviewButtons } from './job-review-buttons'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { latestJobForStudy } from '@/server/db/queries'
import * as actions from '@/server/actions/study-job.actions'
import { FileType, StudyJobStatus, StudyStatus } from '@/database/types'

vi.spyOn(actions, 'approveStudyJobFilesAction')
vi.spyOn(actions, 'rejectStudyJobFilesAction')

vi.mock('@/server/storage', () => ({
    storeApprovedJobFile: vi.fn(),
}))

describe('Study Results Approve/Reject buttons', async () => {
    const testResults = [
        {
            path: 'test.csv',
            contents: new TextEncoder().encode('test123').buffer as ArrayBuffer,
            sourceId: 'test',
            fileType: 'APPROVED-RESULT' as FileType,
        },
    ]

    const insertAndRender = async (studyStatus: StudyStatus) => {
        const { org } = await mockSessionWithTestData()
        const { latestJobWithStatus: job } = await insertTestStudyJobData({ org, studyStatus })
        return await act(async () => {
            const helpers = renderWithProviders(<JobReviewButtons job={job} decryptedResults={testResults} />)
            return { ...helpers, job, org }
        })
    }

    const clickNTest = async (btnLabel: string, action: Mock, statusChange: StudyJobStatus) => {
        const { getByRole, job, org } = await insertAndRender('PENDING-REVIEW')
        expect(screen.queryByText(/approved on/i)).toBeNull()
        await act(async () => {
            const btn = getByRole('button', { name: btnLabel })
            fireEvent.click(btn)
        })
        await waitFor(async () => {
            expect(action).toHaveBeenCalled()
            const latestJob = await latestJobForStudy(job.studyId, { orgSlug: org.slug })
            console.log(latestJob.statusChanges)
            expect(latestJob.statusChanges.find((sc) => sc.status == statusChange)).not.toBeUndefined()
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
        await clickNTest('Approve', actions.approveStudyJobFilesAction as Mock, 'FILES-APPROVED')
    })

    it('can reject results', async () => {
        await clickNTest('Reject', actions.rejectStudyJobFilesAction as Mock, 'FILES-REJECTED')
    })
})
