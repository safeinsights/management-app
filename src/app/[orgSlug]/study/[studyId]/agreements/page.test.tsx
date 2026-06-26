import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import * as RouterMock from 'next-router-mock'
import {
    db,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockDualRoleSessionWithTestData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import StudyAgreementsRoute from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (orgSlug: string, studyId: string) =>
    StudyAgreementsRoute({
        params: Promise.resolve({ orgSlug, studyId }),
        searchParams: Promise.resolve({}),
    })

describe('StudyAgreementsRoute', () => {
    it('renders reviewer agreements when code is submitted and not yet acknowledged', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        expect(screen.getByText('STEP 2A')).toBeInTheDocument()
        expect(screen.getByText('STEP 2B')).toBeInTheDocument()
        expect(screen.getByText('STEP 2C')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Proceed to Step 3/ })).toBeInTheDocument()
    })

    it('redirects reviewer to review when no code has been submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'JOB-READY' })

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/review'))
    })

    // /agreements is now revisitable for reviewers too: once code is submitted it renders the
    // agreements page regardless of ack state. The /review state machine is the screen authority.
    it('renders reviewer agreements even after acknowledging (revisitable, no redirect)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })
        await db
            .updateTable('study')
            .set({ reviewerAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByText('STEP 2A')).toBeInTheDocument()
    })

    it('renders researcher agreements for APPROVED study not yet acknowledged', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        expect(screen.getByText('STEP 3A')).toBeInTheDocument()
        expect(screen.getByText('STEP 3B')).toBeInTheDocument()
        expect(screen.getByText('STEP 3C')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Proceed to Step 4/ })).toBeInTheDocument()
    })

    // /agreements is a revisitable researcher step: it renders for an authorized researcher
    // regardless of ack state or study status, and no longer self-redirects. resolveScreen (on
    // /view) is the screen authority.
    it('renders researcher agreements even after acknowledging (revisitable, no redirect)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db
            .updateTable('study')
            .set({ researcherAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByText('STEP 3A')).toBeInTheDocument()
    })

    it('renders researcher agreements even when study is not APPROVED (revisitable, no redirect)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'DRAFT')

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByText('STEP 3A')).toBeInTheDocument()
    })

    // OTTER-614: Previous → the read-only initial-request screen (/view?step=proposal), the current
    // Cruising Fin proposal page, NOT the legacy /submitted page. ?step=proposal pins the view's
    // first step so an advanced study does not re-resolve forward.
    it('Previous button targets /view?step=proposal', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: /Previous/ }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { asPath } = (RouterMock as any).memoryRouter
        expect(asPath).toBe(`/${org.slug}/study/${study.id}/view?step=proposal`)
        expect(asPath).not.toContain('from=')
    })

    // OTTER-614: once code is submitted, Proceed lands on the read-only code screen
    // (/view?step=code), NOT the editable upload page.
    it('Proceed targets /view?step=code when code is already submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: /Proceed to Step 4/ }))

        await waitFor(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { asPath } = (RouterMock as any).memoryRouter
            expect(asPath).toBe(`/${org.slug}/study/${study.id}/view?step=code`)
        })
    })

    it('Proceed targets code upload when no code has been submitted yet', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: /Proceed to Step 4/ }))

        await waitFor(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { asPath } = (RouterMock as any).memoryRouter
            expect(asPath).toBe(`/${org.slug}/study/${study.id}/code`)
        })
    })

    it('renders Previous button for researcher', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument()
    })

    // OTTER-614: a single account that is BOTH a lab researcher and an enclave reviewer must follow
    // the flow matching the URL's org scope. Keying off review ability alone routed this user into
    // the reviewer (DO) flow even under their own lab slug, so Proceed bounced to /review (the DO
    // results view) instead of the researcher /view code page.
    describe('dual-role user (researcher + reviewer)', () => {
        const insertTwoOrgSubmittedStudy = async (labOrgId: string, enclaveOrgId: string, researcherId: string) => {
            const study = await db
                .insertInto('study')
                .values({
                    orgId: enclaveOrgId,
                    submittedByOrgId: labOrgId,
                    containerLocation: 'test-container',
                    title: 'dual-role study',
                    researcherId,
                    piName: 'test',
                    status: 'APPROVED',
                    submittedAt: new Date(),
                    dataSources: ['all'],
                    outputMimeType: 'application/zip',
                    language: 'R',
                })
                .returningAll()
                .executeTakeFirstOrThrow()
            const job = await db
                .insertInto('studyJob')
                .values({ studyId: study.id })
                .returning('id')
                .executeTakeFirstOrThrow()
            await db
                .insertInto('jobStatusChange')
                .values({ status: 'CODE-SUBMITTED', studyJobId: job.id, userId: researcherId })
                .execute()
            return study
        }

        it('under the LAB slug shows researcher agreements and Proceeds to /view (not the DO /review view)', async () => {
            const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
            const study = await insertTwoOrgSubmittedStudy(labOrg.id, enclaveOrg.id, user.id)

            const page = await renderRoute(labOrg.slug, study.id)
            renderWithProviders(page!)

            // Researcher agreements (STEP 3A-C), not the reviewer variant (STEP 2A-C).
            expect(screen.getByText('STEP 3A')).toBeInTheDocument()
            expect(screen.queryByText('STEP 2A')).not.toBeInTheDocument()

            const interact = userEvent.setup()
            await interact.click(screen.getByRole('button', { name: /Proceed to Step 4/ }))
            await waitFor(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { asPath } = (RouterMock as any).memoryRouter
                expect(asPath).toBe(`/${labOrg.slug}/study/${study.id}/view?step=code`)
            })
        })

        it('under the ENCLAVE slug still shows the reviewer agreements', async () => {
            const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
            const study = await insertTwoOrgSubmittedStudy(labOrg.id, enclaveOrg.id, user.id)

            const page = await renderRoute(enclaveOrg.slug, study.id)
            renderWithProviders(page!)

            expect(screen.getByText('STEP 2A')).toBeInTheDocument()
        })
    })
})
