import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import * as RouterMock from 'next-router-mock'
import {
    db,
    insertTestStudyJobData,
    mockDualRoleSessionWithTestData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import ReviewerAgreementsRoute from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (orgSlug: string, studyId: string) =>
    ReviewerAgreementsRoute({
        params: Promise.resolve({ orgSlug, studyId }),
    })

describe('ReviewerAgreementsRoute', () => {
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

    it('Proceed acks and navigates to /review (which re-resolves to the code-review editor)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: /Proceed to Step 3/ }))

        await waitFor(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { asPath } = (RouterMock as any).memoryRouter
            expect(asPath).toBe(`/${org.slug}/study/${study.id}/review`)
        })
    })

    it('redirects reviewer to review when no code has been submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'JOB-READY' })

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/review'))
    })

    // Revisitable for reviewers too: once code is submitted it renders the agreements page regardless
    // of ack state. The /review state machine is the screen authority.
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

    // Dual-role counterpart: when the SAME user reaches the reviewer route via the reviewing
    // (enclave) org's slug, they correctly follow the reviewer flow.
    it('follows the reviewer flow for a dual-role user via the reviewing (enclave) org slug', async () => {
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
        const job = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()
        await db
            .insertInto('jobStatusChange')
            .values({ status: 'CODE-SUBMITTED', studyJobId: job.id, userId: user.id })
            .execute()

        const page = await renderRoute(enclaveOrg.slug, study.id)
        renderWithProviders(page!)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByText('STEP 2A')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Proceed to Step 3/ })).toBeInTheDocument()
    })
})
