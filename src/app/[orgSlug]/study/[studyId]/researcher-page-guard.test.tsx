import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { AccessDeniedAlert } from '@/components/errors'
import { Routes } from '@/lib/routes'
import {
    faker,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockDataPartnerSessionWithLabStudy,
    mockDualRoleSessionWithTestData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import { researcherPageGuard } from './researcher-page-guard'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const guardFor = (study: { id: string; orgId: string; submittedByOrgId: string }, orgSlug: string) =>
    researcherPageGuard({ orgId: study.orgId, orgSlug, submittedByOrgId: study.submittedByOrgId }, study.id)

describe('researcherPageGuard', () => {
    // Separate orgs and a different researcher, so a guard that checked orgId or researcherId
    // instead of the submitting lab would fail here.
    it('lets in a member of the submitting lab who is not the study researcher', async () => {
        const { org: lab } = await mockSessionWithTestData({ orgType: 'lab' })
        const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user: colleague } = await insertTestUser({ org: lab })
        const { study } = await insertTestStudyJobData({
            org: enclave,
            submittedByOrg: lab,
            researcherId: colleague.id,
            studyStatus: 'PENDING-REVIEW',
        })

        await expect(guardFor(study, enclave.slug)).resolves.toEqual({ ok: true })
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('sends a Data Partner member to the review page of the study', async () => {
        const { enclave, study } = await mockDataPartnerSessionWithLabStudy({ studyStatus: 'PENDING-REVIEW' })

        await expect(guardFor(study, enclave.slug)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(Routes.studyReview({ orgSlug: enclave.slug, studyId: study.id }))
    })

    it('lets in a dual-role user whose lab submitted the study', async () => {
        const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
        const { study } = await insertTestStudyJobData({
            org: enclaveOrg,
            submittedByOrg: labOrg,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })

        await expect(guardFor(study, enclaveOrg.slug)).resolves.toEqual({ ok: true })
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('lets in an SI admin who belongs to neither org', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { study } = await insertTestStudyJobData({
            org: enclave,
            submittedByOrg: lab,
            studyStatus: 'PENDING-REVIEW',
        })

        await expect(guardFor(study, enclave.slug)).resolves.toEqual({ ok: true })
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('refuses a member of another lab', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })
        const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const otherLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { study } = await insertTestStudyJobData({
            org: enclave,
            submittedByOrg: otherLab,
            studyStatus: 'PENDING-REVIEW',
        })

        const result = await guardFor(study, enclave.slug)

        expect(result.ok).toBe(false)
        expect(mockRedirect).not.toHaveBeenCalled()
        if (!result.ok) renderWithProviders(<>{result.render}</>)
        expect(screen.getByText('No such study exists')).toBeInTheDocument()
    })

    it('denies access when there is no session, as the reviewer guard does', async () => {
        const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { study } = await insertTestStudyJobData({
            org: enclave,
            submittedByOrg: lab,
            studyStatus: 'PENDING-REVIEW',
        })
        mockClerkSession(null)

        const result = await guardFor(study, enclave.slug)

        expect(result.ok).toBe(false)
        expect(mockRedirect).not.toHaveBeenCalled()
        if (!result.ok) expect(result.render.type).toBe(AccessDeniedAlert)
    })
})
