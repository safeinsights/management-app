import { describe, expect, it, vi } from 'vitest'
import * as apiHandler from './route'
import { urlForLegalDocumentVersion } from '@/server/legal-document'
import {
    actionResult,
    BLANK_UUID,
    faker,
    insertTestOrg,
    insertTestStudyOnly,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import {
    acknowledgeLegalDocumentAction,
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'

// The route only resolves the version row; stub the presign so no S3 is needed. The headers it
// builds are covered in storage.test.ts.
vi.mock('@/server/legal-document', () => ({
    urlForLegalDocumentVersion: vi.fn(async () => 'https://signed.example/agreement.pdf'),
}))

const request = () => new Request('http://localhost/dl/legal/x', { method: 'GET' })

const get = (versionId: string) => apiHandler.GET(request(), { params: Promise.resolve({ versionId }) })

const seedStudyAgreement = async () => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { study } = await insertTestStudyOnly({ org: dataPartner, submittedByOrg: researchLab, status: 'APPROVED' })

    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type: 'SLA', studyId: study.id, fileName: 'agreement.pdf' }),
    )

    return { version, dataPartner, researchLab }
}

const publish = async (versionId: string) =>
    actionResult(await publishLegalDocumentVersionAction({ versionId, signedAt: '2026-06-17' }))

describe('GET /dl/legal/[versionId]', () => {
    it('redirects an SI admin to the signed URL', async () => {
        const { version } = await seedStudyAgreement()
        await publish(version.id)

        const resp = await get(version.id)

        expect(resp.status).toBe(307)
        expect(resp.headers.get('location')).toBe('https://signed.example/agreement.pdf')
        expect(vi.mocked(urlForLegalDocumentVersion)).toHaveBeenCalledWith(
            expect.objectContaining({ versionId: version.id, fileName: 'agreement.pdf', format: 'pdf' }),
        )
    })

    it('redirects an admin of a party org', async () => {
        const { version, dataPartner } = await seedStudyAgreement()
        await publish(version.id)
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        expect((await get(version.id)).status).toBe(307)
    })

    // The study-agreement modal links here before the acknowledgement exists, so a party who has not
    // signed yet must still be able to read what they are being asked to sign.
    it('redirects a plain member of a party org who has not acknowledged it', async () => {
        const { version, researchLab } = await seedStudyAgreement()
        await publish(version.id)
        await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab', isAdmin: false })

        expect((await get(version.id)).status).toBe(307)
    })

    it('redirects a plain member who acknowledged this version', async () => {
        const { version, dataPartner } = await seedStudyAgreement()
        await publish(version.id)
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: false })
        actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))

        expect((await get(version.id)).status).toBe(307)
    })

    it('refuses a member of an unrelated org who never acknowledged it', async () => {
        const { version } = await seedStudyAgreement()
        await publish(version.id)
        await mockSessionWithTestData({ orgType: 'lab', isAdmin: true })

        expect((await get(version.id)).status).toBe(401)
    })

    it('refuses an unpublished draft', async () => {
        const { version, dataPartner } = await seedStudyAgreement()
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        expect((await get(version.id)).status).toBe(401)
    })

    it('refuses a global document to a user who never acknowledged it, since it binds no org', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { version } = actionResult(await createLegalDocumentDraftAction({ type: 'TOS', fileName: 'tos.md' }))
        // No signedAt: a TOS is published, not signed.
        actionResult(await publishLegalDocumentVersionAction({ versionId: version.id }))
        await mockSessionWithTestData({ orgType: 'lab', isAdmin: true })

        expect((await get(version.id)).status).toBe(401)
    })

    it('answers 401 (not 404) for an unknown id, so a probe learns nothing', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        expect((await get(BLANK_UUID)).status).toBe(401)
    })
})
