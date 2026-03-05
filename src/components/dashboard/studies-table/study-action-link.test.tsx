import { StudyJobStatus, StudyStatus } from '@/database/types'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StudyActionLink } from './study-action-link'
import { StudyRow } from './types'

const ORG_SLUG = 'test-org'
const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const mockStudy = (overrides: Partial<StudyRow> = {}): StudyRow => ({
    id: STUDY_ID,
    title: 'Test Study',
    status: 'APPROVED' as StudyStatus,
    createdAt: new Date(),
    researcherId: 'researcher-1',
    reviewerId: null,
    createdBy: 'Researcher Name',
    jobStatusChanges: [],
    ...overrides,
})

describe('StudyActionLink', () => {
    describe('researcher audience', () => {
        it('links to edit page for DRAFT studies', () => {
            const study = mockStudy({ status: 'DRAFT' as StudyStatus })
            renderWithProviders(
                <StudyActionLink study={study} audience="researcher" orgSlug={ORG_SLUG} isHighlighted={false} />,
            )

            const link = screen.getByRole('link', { name: /edit draft study/i })
            expect(link).toBeDefined()
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/edit`)
        })

        it('links to submitted page for PENDING-REVIEW studies', () => {
            const study = mockStudy({ status: 'PENDING-REVIEW' as StudyStatus })
            renderWithProviders(
                <StudyActionLink study={study} audience="researcher" orgSlug={ORG_SLUG} isHighlighted={false} />,
            )

            const link = screen.getByRole('link', { name: /view details/i })
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/submitted`)
        })

        it('links to agreements page for APPROVED studies with no job activity', () => {
            const study = mockStudy({ status: 'APPROVED' as StudyStatus, jobStatusChanges: [] })
            renderWithProviders(
                <StudyActionLink study={study} audience="researcher" orgSlug={ORG_SLUG} isHighlighted={false} />,
            )

            const link = screen.getByRole('link', { name: /view details/i })
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/agreements`)
        })

        it('links to study view page for APPROVED studies with job activity', () => {
            const study = mockStudy({
                status: 'APPROVED' as StudyStatus,
                jobStatusChanges: [{ status: 'CODE-SUBMITTED' as StudyJobStatus, userId: null }],
            })
            renderWithProviders(
                <StudyActionLink study={study} audience="researcher" orgSlug={ORG_SLUG} isHighlighted={false} />,
            )

            const link = screen.getByRole('link', { name: /view details/i })
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/view`)
        })

        it('uses submittedByOrgSlug when available', () => {
            const study = mockStudy({
                status: 'PENDING-REVIEW' as StudyStatus,
                submittedByOrgSlug: 'lab-org',
            })
            renderWithProviders(
                <StudyActionLink study={study} audience="researcher" orgSlug={ORG_SLUG} isHighlighted={false} />,
            )

            const link = screen.getByRole('link', { name: /view details/i })
            expect(link.getAttribute('href')).toBe(`/lab-org/study/${STUDY_ID}/submitted`)
        })
    })

    describe('reviewer audience', () => {
        it('links to agreements page when latest job status is CODE-SUBMITTED', () => {
            const study = mockStudy({
                orgSlug: 'review-org',
                jobStatusChanges: [{ status: 'CODE-SUBMITTED' as StudyJobStatus, userId: null }],
            })
            renderWithProviders(
                <StudyActionLink study={study} audience="reviewer" orgSlug={ORG_SLUG} isHighlighted={false} />,
            )

            const link = screen.getByRole('link', { name: /view/i })
            expect(link.getAttribute('href')).toBe(`/review-org/study/${STUDY_ID}/agreements`)
        })

        it('links to review page when latest job status is not CODE-SUBMITTED or CODE-SCANNED', () => {
            const study = mockStudy({
                orgSlug: 'review-org',
                jobStatusChanges: [{ status: 'JOB-RUNNING' as StudyJobStatus, userId: null }],
            })
            renderWithProviders(
                <StudyActionLink study={study} audience="reviewer" orgSlug={ORG_SLUG} isHighlighted={false} />,
            )

            const link = screen.getByRole('link', { name: /view/i })
            expect(link.getAttribute('href')).toBe(`/review-org/study/${STUDY_ID}/review`)
        })
    })
})
