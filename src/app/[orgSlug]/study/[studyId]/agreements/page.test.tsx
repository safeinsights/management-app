import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import * as RouterMock from 'next-router-mock'
import {
    db,
    insertTestStudyJobData,
    insertTestStudyOnly,
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

    it('Proceed targets plain /view (which re-resolves to code-status) when code is already submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: /Proceed to Step 4/ }))

        await waitFor(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { asPath } = (RouterMock as any).memoryRouter
            expect(asPath).toBe(`/${org.slug}/study/${study.id}/view`)
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
})
