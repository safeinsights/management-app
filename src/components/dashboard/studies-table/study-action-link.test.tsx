import { StudyJobStatus, StudyStatus } from '@/database/types'
import { mockStudyRow, renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StudyActionLink } from './study-action-link'

const ORG_SLUG = 'test-org'
const STUDY_ID = '11111111-1111-4111-8111-111111111111'

describe('StudyActionLink', () => {
    describe('researcher audience', () => {
        it('links to edit page for DRAFT studies', () => {
            const study = mockStudyRow({ status: 'DRAFT' as StudyStatus })
            renderWithProviders(
                <StudyActionLink
                    study={study}
                    audience="researcher"
                    scope="user"
                    orgSlug={ORG_SLUG}
                    isHighlighted={false}
                />,
            )

            const link = screen.getByRole('link', { name: /edit draft study/i })
            expect(link).toBeDefined()
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/edit`)
        })

        it('links to submitted page for PENDING-REVIEW studies without job activity', () => {
            const study = mockStudyRow({ status: 'PENDING-REVIEW' as StudyStatus, jobStatusChanges: [] })
            renderWithProviders(
                <StudyActionLink
                    study={study}
                    audience="researcher"
                    scope="user"
                    orgSlug={ORG_SLUG}
                    isHighlighted={false}
                />,
            )

            const link = screen.getByRole('link', { name: /view details/i })
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/submitted`)
        })

        it('links to view page for PENDING-REVIEW studies with job activity', () => {
            const study = mockStudyRow({
                status: 'PENDING-REVIEW' as StudyStatus,
                jobStatusChanges: [{ status: 'CODE-SUBMITTED' as StudyJobStatus, userId: null }],
            })
            renderWithProviders(
                <StudyActionLink
                    study={study}
                    audience="researcher"
                    scope="user"
                    orgSlug={ORG_SLUG}
                    isHighlighted={false}
                />,
            )

            const link = screen.getByRole('link', { name: /view details/i })
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/view`)
        })

        it('links to agreements page for APPROVED studies with no job activity', () => {
            const study = mockStudyRow({ status: 'APPROVED' as StudyStatus, jobStatusChanges: [] })
            renderWithProviders(
                <StudyActionLink
                    study={study}
                    audience="researcher"
                    scope="user"
                    orgSlug={ORG_SLUG}
                    isHighlighted={false}
                />,
            )

            const link = screen.getByRole('link', { name: /view details/i })
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/agreements`)
        })

        it('links to code page for APPROVED studies with only baseline job', () => {
            const study = mockStudyRow({
                status: 'APPROVED' as StudyStatus,
                jobStatusChanges: [{ status: 'INITIATED' as StudyJobStatus, userId: null }],
            })
            renderWithProviders(
                <StudyActionLink
                    study={study}
                    audience="researcher"
                    scope="user"
                    orgSlug={ORG_SLUG}
                    isHighlighted={false}
                />,
            )

            const link = screen.getByRole('link', { name: /view details/i })
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/code`)
        })

        it('links to view page for APPROVED studies after code submitted', () => {
            const study = mockStudyRow({
                status: 'APPROVED' as StudyStatus,
                jobStatusChanges: [
                    { status: 'INITIATED' as StudyJobStatus, userId: null },
                    { status: 'CODE-SUBMITTED' as StudyJobStatus, userId: null },
                ],
            })
            renderWithProviders(
                <StudyActionLink
                    study={study}
                    audience="researcher"
                    scope="user"
                    orgSlug={ORG_SLUG}
                    isHighlighted={false}
                />,
            )

            const link = screen.getByRole('link', { name: /view details/i })
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/view`)
        })

        it('uses submittedByOrgSlug when available', () => {
            const study = mockStudyRow({
                status: 'PENDING-REVIEW' as StudyStatus,
                submittedByOrgSlug: 'lab-org',
            })
            renderWithProviders(
                <StudyActionLink
                    study={study}
                    audience="researcher"
                    scope="user"
                    orgSlug={ORG_SLUG}
                    isHighlighted={false}
                />,
            )

            const link = screen.getByRole('link', { name: /view details/i })
            expect(link.getAttribute('href')).toBe(`/lab-org/study/${STUDY_ID}/submitted`)
        })
    })

    describe('reviewer audience', () => {
        it('links to review page for all studies', () => {
            const study = mockStudyRow({
                orgSlug: 'review-org',
                jobStatusChanges: [{ status: 'CODE-SUBMITTED' as StudyJobStatus, userId: null }],
            })
            renderWithProviders(
                <StudyActionLink
                    study={study}
                    audience="reviewer"
                    scope="user"
                    orgSlug={ORG_SLUG}
                    isHighlighted={false}
                />,
            )

            const link = screen.getByRole('link', { name: /view/i })
            expect(link.getAttribute('href')).toBe(`/review-org/study/${STUDY_ID}/review`)
        })
    })
})
