import { describe, expect, it, vi } from 'vitest'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { signedUrlForFile } from '@/server/aws'
import { actionResult, faker, insertTestOrg, mockSessionWithTestData } from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    fetchParticipationAgreementsAction,
    publishLegalDocumentVersionAction,
} from './legal-document.actions'
import type { ParticipationAgreementType } from '@/schema/legal-document'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn().mockResolvedValue('https://mock-signed-url.example.com/file'),
        createSignedUploadUrl: vi.fn().mockResolvedValue({ url: 'https://mock-s3.example.com', fields: { key: 'k' } }),
    }
})

const insertSignatory = (type: ParticipationAgreementType) =>
    insertTestOrg({ slug: faker.string.alpha(10), type: type === 'dopa' ? 'enclave' : 'lab' })

const uploadAndPublish = async (
    type: ParticipationAgreementType,
    orgId: string,
    signedAt: string,
    fileName = 'agreement.pdf',
) => {
    const { version } = actionResult(await createLegalDocumentDraftAction({ type, orgId, fileName }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
}

const rowFor = async (type: ParticipationAgreementType, orgId: string) => {
    const rows = actionResult(await fetchParticipationAgreementsAction({ type }))
    return rows.find((row) => row.orgId === orgId)
}

describe('fetchParticipationAgreementsAction', () => {
    it('lists an org that has not signed yet, since the gap is what the table is for', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await insertSignatory('dopa')

        const row = await rowFor('dopa', org.id)

        expect(row?.orgName).toBe(org.name)
        expect(row?.legalDocumentId).toBeNull()
        expect(row?.versionNumber).toBeNull()
        expect(row?.signedAt).toBeNull()
        expect(row?.downloadUrl).toBeNull()
    })

    it('reports the signed date and a link once an agreement is published', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await insertSignatory('dopa')
        await uploadAndPublish('dopa', org.id, '2026-07-27')

        const row = await rowFor('dopa', org.id)

        expect(row?.versionNumber).toBe(1)
        // Read back as text, so the day entered survives whatever zone the reader is in.
        expect(row?.signedAt).toBe('2026-07-27')
        expect(vi.mocked(signedUrlForFile)).toHaveBeenCalledWith(row!.filePath)
    })

    it('shows only the newest published version for an org', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await insertSignatory('ropa')
        await uploadAndPublish('ropa', org.id, '2026-07-01', 'ropa-v1.pdf')
        await uploadAndPublish('ropa', org.id, '2026-07-27', 'ropa-v2.pdf')

        const rows = actionResult(await fetchParticipationAgreementsAction({ type: 'ropa' }))
        const forOrg = rows.filter((row) => row.orgId === org.id)

        expect(forOrg).toHaveLength(1)
        expect(forOrg[0]!.versionNumber).toBe(2)
        expect(forOrg[0]!.signedAt).toBe('2026-07-27')
    })

    it('leaves a drafted agreement out of the current row', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await insertSignatory('dopa')
        actionResult(await createLegalDocumentDraftAction({ type: 'dopa', orgId: org.id, fileName: 'dopa.pdf' }))

        const row = await rowFor('dopa', org.id)

        // The document exists, but nothing has been published against it yet.
        expect(row?.legalDocumentId).not.toBeNull()
        expect(row?.versionNumber).toBeNull()
    })

    it('offers Data Partners to a dopa and Research Labs to a ropa, never the other way round', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const dataPartner = await insertSignatory('dopa')
        const researchLab = await insertSignatory('ropa')

        const dopaRows = actionResult(await fetchParticipationAgreementsAction({ type: 'dopa' }))
        const ropaRows = actionResult(await fetchParticipationAgreementsAction({ type: 'ropa' }))

        expect(dopaRows.some((row) => row.orgId === dataPartner.id)).toBe(true)
        expect(dopaRows.some((row) => row.orgId === researchLab.id)).toBe(false)
        expect(ropaRows.some((row) => row.orgId === researchLab.id)).toBe(true)
        expect(ropaRows.some((row) => row.orgId === dataPartner.id)).toBe(false)
    })

    // SafeInsights is the counterparty to every one of these, and publishing cannot be undone.
    it('never offers SafeInsights itself as a signatory', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const safeInsights = await insertTestOrg({ slug: CLERK_ADMIN_ORG_SLUG, type: 'enclave' })

        const rows = actionResult(await fetchParticipationAgreementsAction({ type: 'dopa' }))

        expect(rows.some((row) => row.orgId === safeInsights.id)).toBe(false)
    })

    it("does not let an org's agreement show up under the other type", async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await insertSignatory('dopa')
        await uploadAndPublish('dopa', org.id, '2026-07-27')

        const rows = actionResult(await fetchParticipationAgreementsAction({ type: 'ropa' }))

        expect(rows.some((row) => row.orgId === org.id)).toBe(false)
    })

    it('denies a user who is not an SI admin', async () => {
        await mockSessionWithTestData()

        expect(await fetchParticipationAgreementsAction({ type: 'dopa' })).toHaveProperty('error')
    })
})
