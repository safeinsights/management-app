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

    it('redirects reviewer to review when agreements already acknowledged', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })
        await db
            .updateTable('study')
            .set({ reviewerAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/review'))
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

    it('redirects researcher when agreements already acknowledged', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db
            .updateTable('study')
            .set({ researcherAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/code'))
    })

    it('redirects acked researcher with baseline job (no CODE-SUBMITTED) to /code, not /view', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'JOB-READY' })
        await db
            .updateTable('study')
            .set({ researcherAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/code'))
        expect(mockRedirect).not.toHaveBeenCalledWith(expect.stringContaining('/view'))
    })

    it('redirects acked researcher with CODE-SUBMITTED job to /view', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })
        await db
            .updateTable('study')
            .set({ researcherAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })

    it('Previous button targets the proposal view for researcher with job activity', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: /Previous/ }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { asPath } = (RouterMock as any).memoryRouter
        expect(asPath).toContain(`/${org.slug}/study/${study.id}/view`)
        expect(asPath).toContain('from=agreements')
    })

    it('Previous button preserves returnTo=org through the agreements flow', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ returnTo: 'org' }),
        })
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: /Previous/ }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { asPath } = (RouterMock as any).memoryRouter
        expect(asPath).toContain('from=agreements')
        expect(asPath).toContain('returnTo=org')
    })

    it('Proceed targets the code-status view via from=code-decision (not code upload) when code is already submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'previous' }),
        })
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: /Proceed to Step 4/ }))

        await waitFor(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { asPath } = (RouterMock as any).memoryRouter
            expect(asPath).toBe(`/${org.slug}/study/${study.id}/view?from=code-decision`)
        })
    })

    it('Proceed targets code upload when no code has been submitted yet', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'previous' }),
        })
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

    it('redirects researcher when study is not APPROVED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'DRAFT')

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })

    it('allows direct access via Previous button when study is not APPROVED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'REJECTED')

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'previous' }),
        })
        renderWithProviders(page!)

        expect(screen.getByText('STEP 3A')).toBeInTheDocument()
    })

    it('allows direct access via Previous button even after acknowledging', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db
            .updateTable('study')
            .set({ researcherAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'previous' }),
        })
        renderWithProviders(page!)

        expect(screen.getByText('STEP 3A')).toBeInTheDocument()
    })

    // OTTER-533: back-navigation skips the redirects above, so the proceed button must not send a
    // study whose code is already submitted to the first-submission upload page (step 4).
    it('researcher proceed targets the study view (not the upload page) when code is already submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'previous' }),
        })
        renderWithProviders(page!)

        expect(screen.getByRole('button', { name: 'View study' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Proceed to Step 4/ })).not.toBeInTheDocument()
    })
})
