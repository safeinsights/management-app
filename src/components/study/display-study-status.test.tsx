import { StudyJobStatus, StudyStatus } from '@/database/types'
import { mockPathname, renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DisplayStudyStatus } from './display-study-status'

// default pathname for tests
mockPathname('/')

describe('DisplayStudyStatus', () => {
    const renderAndExpect = (
        studyStatus: StudyStatus,
        jobStatus: StudyJobStatus | null,
        expectedType: string | null,
        expectedLabel: string | null,
    ) => {
        renderWithProviders(<DisplayStudyStatus studyStatus={studyStatus} jobStatus={jobStatus} />)

        if (expectedType) {
            expect(screen.getByText(expectedType)).toBeDefined()
        } else {
            // Ensure that none of the type headers are rendered when not expected
            expect(screen.queryByText(/Proposal|Code|Results/)).toBeNull()
        }

        if (expectedLabel) {
            expect(screen.getByText(expectedLabel)).toBeDefined()
        }
    }

    it('shows proposal status when there is no job', () => {
        renderAndExpect('PENDING-REVIEW', null, 'Proposal', 'Under Review')
    })

    it('falls back to study status when job status is unmapped', () => {
        // JOB-PROVISIONING is not in STATUS_LABELS, should display study status
        renderAndExpect('REJECTED', 'JOB-PROVISIONING', 'Proposal', 'Rejected')
    })

    it('shows proposal status for CODE-APPROVED', () => {
        renderAndExpect('APPROVED', 'CODE-APPROVED', 'Proposal', 'Approved')
    })

    it('shows mapped results status', () => {
        renderAndExpect('APPROVED', 'RUN-COMPLETE', 'Results', 'Under Review')
    })

    // ------------------------------------------------------
    // Reviewer-facing path (starts with /reviewer/) test cases
    // ------------------------------------------------------

    it('shows reviewer proposal awaiting review', () => {
        mockPathname('/reviewer/test-study')
        renderAndExpect('PENDING-REVIEW', null, 'Proposal', 'Awaiting Review')
    })

    it('shows reviewer results awaiting review', () => {
        mockPathname('/reviewer/test-study')
        renderAndExpect('APPROVED', 'RUN-COMPLETE', 'Results', 'Awaiting Review')
    })

    // ------------------------------------------------------
    // Researcher-facing path (starts with /researcher/) test cases
    // ------------------------------------------------------

    it('shows researcher proposal under review', () => {
        mockPathname('/researcher/test-study')
        renderAndExpect('PENDING-REVIEW', null, 'Proposal', 'Under Review')
    })

    it('shows researcher results under review', () => {
        mockPathname('/researcher/test-study')
        renderAndExpect('APPROVED', 'RUN-COMPLETE', 'Results', 'Under Review')
    })
    it('does not show errored status to researchers before file review', () => {
        mockPathname('/researcher/test-study')
        renderAndExpect('APPROVED', 'JOB-ERRORED', 'Proposal', 'Approved')
    })
})
