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
import ResearcherAgreementsRoute from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (orgSlug: string, studyId: string, searchParams: Record<string, string | undefined> = {}) =>
    ResearcherAgreementsRoute({
        params: Promise.resolve({ orgSlug, studyId }),
        searchParams: Promise.resolve(searchParams),
    })

describe('ResearcherAgreementsRoute', () => {
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

    // Revisitable researcher step: renders for an authorized researcher regardless of ack state or
    // study status, and does not self-redirect. resolveScreen (on /view) is the screen authority.
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

    // Previous → /submitted (the approved-proposal page with a working "Proceed to step 3"), NOT
    // /view — /view resolves to proposal-feedback, which has no forward path and would dead-end an
    // approved-no-code researcher.
    it('Previous button targets /submitted (not /view), no ?from=', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: /Previous/ }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { asPath } = (RouterMock as any).memoryRouter
        expect(asPath).toBe(`/${org.slug}/study/${study.id}/submitted`)
        expect(asPath).not.toContain('from=')
    })

    // "Proceed to Step 4" → the code step (/view/code), not plain /view (which would jump an advanced
    // study straight to results).
    it('Proceed targets /view/code when code is already submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: /Proceed to Step 4/ }))

        await waitFor(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { asPath } = (RouterMock as any).memoryRouter
            expect(asPath).toBe(`/${org.slug}/study/${study.id}/view/code`)
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

    // Dual-role regression: a user who is both reviewer (enclave) and researcher (their own lab)
    // reaches this researcher route via their lab's slug after clicking "Proceed to step 3" on the
    // approved proposal. Even though they CAN review, this route keeps them in the researcher flow —
    // it must NOT bounce them into the reviewer agreement → /review loop.
    it('keeps a dual-role user in the researcher flow (does not treat them as a reviewer)', async () => {
        const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
        const study = await db
            .insertInto('study')
            .values({
                orgId: enclaveOrg.id,
                submittedByOrgId: labOrg.id,
                containerLocation: 'test-container',
                title: 'dual-role study',
                researcherId: user.id,
                piName: 'test',
                status: 'APPROVED',
                submittedAt: new Date(),
                dataSources: ['all'],
                outputMimeType: 'application/zip',
                language: 'R',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const page = await renderRoute(labOrg.slug, study.id)
        renderWithProviders(page!)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByText('STEP 3A')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Proceed to Step 4/ })).toBeInTheDocument()
    })
})
