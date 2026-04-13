import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import { db } from '@/database'
import StudyAgreementsRoute from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

describe('StudyAgreementsRoute', () => {
    it('renders reviewer sections and proceed to review for enclave reviewer with CODE-SUBMITTED job', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })
        renderWithProviders(page!)

        expect(screen.getByText('STEP 2A')).toBeInTheDocument()
        expect(screen.getByText('STEP 2B')).toBeInTheDocument()
        expect(screen.getByText('STEP 2C')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Proceed to Step 3/ })).toBeInTheDocument()
    })

    it('redirects reviewer to review page when job status is not CODE-SCANNED or CODE-SUBMITTED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'JOB-READY' })

        await expect(
            StudyAgreementsRoute({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({}),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/review'))
    })

    it('redirects reviewer to review page on resubmission (second job)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-REJECTED' })

        // Create a second job (resubmission) with CODE-SUBMITTED
        const resubJob = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()
        await db
            .insertInto('jobStatusChange')
            .values([
                { studyJobId: resubJob.id, status: 'INITIATED' },
                { studyJobId: resubJob.id, status: 'CODE-SUBMITTED' },
            ])
            .execute()

        await expect(
            StudyAgreementsRoute({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/review'))
    })

    it('redirects reviewer when code has been approved', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-APPROVED' })

        await expect(
            StudyAgreementsRoute({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/review'))
    })

    it('renders researcher sections and proceed to code for APPROVED researcher with no job activity', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })
        renderWithProviders(page!)

        expect(screen.getByText('STEP 3A')).toBeInTheDocument()
        expect(screen.getByText('STEP 3B')).toBeInTheDocument()
        expect(screen.getByText('STEP 3C')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Proceed to Step 4/ })).toBeInTheDocument()
    })

    it('renders Back to Study Details for researcher with job activity', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })
        renderWithProviders(page!)

        expect(screen.getByRole('button', { name: /Back to Study Details/ })).toBeInTheDocument()
    })

    it('renders Previous button for APPROVED researcher with no job activity', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })
        renderWithProviders(page!)

        const previousButton = screen.getByRole('button', { name: 'Previous' })
        expect(previousButton).toBeInTheDocument()
    })

    it('redirects researcher when study is not APPROVED and has no job activity', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db.updateTable('study').set({ status: 'DRAFT' }).where('id', '=', study.id).execute()

        await expect(
            StudyAgreementsRoute({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({}),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })
})
