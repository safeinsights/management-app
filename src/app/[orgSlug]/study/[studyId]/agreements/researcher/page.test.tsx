import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import {
    db,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockDualRoleSessionWithTestData,
    mockSessionWithTestData,
    setTestStudyStatus,
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

// OTTER-727 hid the Agreements step; the route exists only to catch stale bookmarks and history.
describe('ResearcherAgreementsRoute (hidden — redirects)', () => {
    it('redirects an APPROVED study with no code to the code upload page', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/code`)
    })

    it('redirects to /view/code once code has been submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/view/code`)
    })

    it('preserves returnTo=org on the redirect so org scope survives the hop', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        await expect(renderRoute(org.slug, study.id, { returnTo: 'org' })).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/view/code?returnTo=org`)
    })

    it('redirects regardless of ack state (the ack no longer gates anything)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db
            .updateTable('study')
            .set({ researcherAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/code`)
    })

    it('redirects a non-APPROVED study too', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'DRAFT')

        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/code`)
    })

    // A user who is both reviewer and researcher must stay in the researcher flow.
    it('keeps a dual-role user in the researcher flow', async () => {
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

        await expect(renderRoute(labOrg.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(`/${labOrg.slug}/study/${study.id}/code`)
    })
})
