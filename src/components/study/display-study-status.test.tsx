import { describe, expect, it } from 'vitest'
import { StudyJobStatus, StudyStatus } from '@/database/types'
import { renderWithProviders, setMockPathname } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { DisplayStudyStatus } from './display-study-status'

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

    it('falls back to job status when job status is unmapped', () => {
        // JOB-PROVISIONING is not in STATUS_LABELS, should display a title-cased version of the job status
        renderAndExpect('REJECTED', 'JOB-PROVISIONING', null, 'Job Provisioning')
    })

    it('shows proposal status for CODE-APPROVED', () => {
        renderAndExpect('APPROVED', 'CODE-APPROVED', 'Proposal', 'Approved')
    })

    it('shows mapped results status', () => {
        renderAndExpect('APPROVED', 'RUN-COMPLETE', 'Results', 'Under Review')
    })

    it('renders a fallback status when the status is not in the STATUS_LABELS map', () => {
        // ARCHIVED and JOB-PROVISIONING are not in STATUS_LABELS, should display titleized job status instead
        renderAndExpect('ARCHIVED', 'JOB-PROVISIONING', null, 'Job Provisioning')
    })

    // ------------------------------------------------------
    // Reviewer-facing path (starts with /reviewer/) test cases
    // ------------------------------------------------------

    it('shows reviewer proposal awaiting review', () => {
        setMockPathname('/reviewer/test-study')
        renderAndExpect('PENDING-REVIEW', null, 'Proposal', 'Awaiting Review')
    })

    it('shows reviewer results awaiting review', () => {
        setMockPathname('/reviewer/test-study')
        renderAndExpect('APPROVED', 'RUN-COMPLETE', 'Results', 'Awaiting Review')
    })

    // ------------------------------------------------------
    // Researcher-facing path (starts with /researcher/) test cases
    // ------------------------------------------------------

    it('shows researcher proposal under review', () => {
        setMockPathname('/researcher/test-study')
        renderAndExpect('PENDING-REVIEW', null, 'Proposal', 'Under Review')
    })

    it('shows researcher results under review', () => {
        setMockPathname('/researcher/test-study')
        renderAndExpect('APPROVED', 'RUN-COMPLETE', 'Results', 'Under Review')
    })
})
