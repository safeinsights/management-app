import { useUser } from '@clerk/nextjs'
import { StudyJobStatus, StudyStatus } from '@/database/types'
import { mockStudyRow, renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudyActionLink } from './study-action-link'

const ORG_SLUG = 'test-org'
const STUDY_ID = '11111111-1111-4111-8111-111111111111'
const RESEARCHER_ID = 'researcher-1' // matches mockStudyRow default

function mockSignedInAs(userId: string) {
    vi.mocked(useUser).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
        user: {
            id: 'clerk-id',
            publicMetadata: {
                format: 'v3',
                user: { id: userId },
                teams: null,
                orgs: {
                    [ORG_SLUG]: { id: 'org-id', slug: ORG_SLUG, type: 'lab', isAdmin: false },
                },
            },
            unsafeMetadata: { currentOrgSlug: ORG_SLUG },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
}

describe('StudyActionLink', () => {
    afterEach(() => {
        vi.mocked(useUser).mockReset()
    })

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

        it('links to submitted page for CHANGE-REQUESTED studies without job activity', () => {
            const study = mockStudyRow({ status: 'CHANGE-REQUESTED' as StudyStatus, jobStatusChanges: [] })
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

        it('links to submitted page for APPROVED studies with no job activity', () => {
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
            expect(link.getAttribute('href')).toBe(`/${ORG_SLUG}/study/${STUDY_ID}/submitted`)
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

        describe('delete bin icon visibility', () => {
            beforeEach(() => {
                mockSignedInAs(RESEARCHER_ID)
            })

            it('renders the bin icon to the right of Edit for DRAFT studies authored by the current user', async () => {
                const study = mockStudyRow({ status: 'DRAFT' as StudyStatus, researcherId: RESEARCHER_ID })
                renderWithProviders(
                    <StudyActionLink
                        study={study}
                        audience="researcher"
                        scope="user"
                        orgSlug={ORG_SLUG}
                        isHighlighted={false}
                    />,
                )

                const editLink = await screen.findByRole('link', { name: /edit draft study/i })
                const binButton = await screen.findByLabelText(/delete draft study/i)

                expect(editLink).toBeInTheDocument()
                expect(binButton).toBeInTheDocument()

                // Bin must come AFTER the edit link in document order (i.e. to the right)
                expect(editLink.compareDocumentPosition(binButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
            })

            it('does NOT render the bin icon for DRAFT studies authored by a different user', async () => {
                const study = mockStudyRow({ status: 'DRAFT' as StudyStatus, researcherId: 'someone-else' })
                renderWithProviders(
                    <StudyActionLink
                        study={study}
                        audience="researcher"
                        scope="user"
                        orgSlug={ORG_SLUG}
                        isHighlighted={false}
                    />,
                )

                await screen.findByRole('link', { name: /edit draft study/i })
                expect(screen.queryByLabelText(/delete draft study/i)).not.toBeInTheDocument()
            })

            it.each<StudyStatus>(['PENDING-REVIEW', 'CHANGE-REQUESTED', 'APPROVED', 'REJECTED', 'ARCHIVED'])(
                'does NOT render the bin icon when status is %s (even when current user is the researcher)',
                async (status) => {
                    const study = mockStudyRow({ status, researcherId: RESEARCHER_ID, jobStatusChanges: [] })
                    renderWithProviders(
                        <StudyActionLink
                            study={study}
                            audience="researcher"
                            scope="user"
                            orgSlug={ORG_SLUG}
                            isHighlighted={false}
                        />,
                    )

                    await screen.findByRole('link', { name: /view details/i })
                    expect(screen.queryByLabelText(/delete draft study/i)).not.toBeInTheDocument()
                },
            )
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
