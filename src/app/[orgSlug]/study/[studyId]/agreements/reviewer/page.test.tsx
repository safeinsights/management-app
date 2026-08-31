import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import {
    db,
    insertTestStudyJobData,
    mockDualRoleSessionWithTestData,
    mockSessionWithTestData,
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

// OTTER-727 hid the Agreements step. This route now exists only to catch stale bookmarks/history: it
// always redirects to bare /review (which re-resolves to the code-review screen) and never renders the
// placeholder.
describe('ReviewerAgreementsRoute (hidden — redirects)', () => {
    it('redirects to /review when code is submitted and not yet acknowledged', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/review`)
    })

    it('redirects to /review when no code has been submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'JOB-READY' })

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/review`)
    })

    it('redirects regardless of ack state (the ack no longer gates anything)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })
        await db
            .updateTable('study')
            .set({ reviewerAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/review`)
    })

    // Dual-role counterpart: reaching this route via the reviewing (enclave) org's slug redirects into
    // the reviewer flow, not the researcher one.
    it('redirects a dual-role user into the reviewer flow via the enclave org slug', async () => {
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

        await expect(renderRoute(enclaveOrg.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(`/${enclaveOrg.slug}/study/${study.id}/review`)
    })
})
