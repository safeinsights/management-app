import { describe, expect, it, vi } from 'vitest'
import { StudyJobStatus, StudyStatus } from '@/database/types'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { DisplayStudyStatus } from './display-study-status'

let mockedAuthInfo = { isReviewer: false }

vi.mock('@/components/auth', () => ({
    useAuthInfo: () => mockedAuthInfo,
}))

describe('DisplayStudyStatus', () => {
    const renderAndExpect = (
        studyStatus: StudyStatus,
        jobStatus: StudyJobStatus | null,
        expectedType: string | null,
        expectedLabel: string | null,
    ) => {
        renderWithProviders(<DisplayStudyStatus studyStatus={studyStatus} jobStatus={jobStatus} />)

        if (expectedType && expectedLabel) {
            expect(screen.getByText(expectedType)).toBeDefined()
            expect(screen.getByText(expectedLabel)).toBeDefined()
        } else {
            expect(screen.queryByText(/Proposal|Code|Results/)).toBeNull()
        }
    }

    it('shows proposal status when there is no job', () => {
        renderAndExpect('PENDING-REVIEW', null, 'Proposal', 'Under Review')
    })

    it('falls back to study status when job status is unmapped', () => {
        // JOB-PROVISIONING is not in STATUS_LABELS, should display study status instead
        renderAndExpect('REJECTED', 'JOB-PROVISIONING', 'Proposal', 'Rejected')
    })

    it('shows mapped code status when available', () => {
        renderAndExpect('APPROVED', 'CODE-APPROVED', 'Code', 'Approved')
    })

    it('shows mapped results status', () => {
        renderAndExpect('APPROVED', 'RUN-COMPLETE', 'Results', 'Under Review')
    })

    it('renders nothing for completely unmapped study status', () => {
        renderAndExpect('INITIATED', null, null, null)
    })

    it('renders a fallback status when the status is not in the STATUS_LABELS map', () => {
        // ARCHIVED and JOB-PROVISIONING are not in STATUS_LABELS, should display titleized status instead
        renderAndExpect('ARCHIVED', 'JOB-PROVISIONING', null, 'Job Provisioning')
    })

    it('shows "Needs Review" for reviewer users', () => {
        // Simulate reviewer UI
        mockedAuthInfo = { isReviewer: true }
        renderAndExpect('PENDING-REVIEW', null, 'Proposal', 'Needs Review')
    })
})
