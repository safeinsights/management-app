import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database'
import type { StudyStatus } from '@/database/types'
import {
    actionResult,
    faker,
    insertTestOrg,
    insertTestStudyOnly,
    mockSessionWithTestData,
    resetLegalDocuments,
} from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    fetchOrgParticipationAgreementAction,
    fetchOrgStudyAgreementsAction,
    publishLegalDocumentVersionAction,
} from './legal-document.actions'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        // Implementations go in vi.fn, not mockResolvedValue: mockReset wipes the latter.
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

beforeEach(resetLegalDocuments)

// Two distinct orgs, so a swapped join or party/counterparty mix-up cannot pass.
const insertPartyOrgs = async () => ({
    dataPartner: await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' }),
    researchLab: await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' }),
})

const insertStudyWithDistinctOrgs = async ({
    status = 'APPROVED' as StudyStatus,
    title = 'A study',
}: { status?: StudyStatus; title?: string } = {}) => {
    const { dataPartner, researchLab } = await insertPartyOrgs()
    const { study } = await insertTestStudyOnly({
        org: dataPartner,
        submittedByOrg: researchLab,
        title,
        status,
    })

    return { study, dataPartner, researchLab }
}

// Publishing needs an SI admin; the org-admin session is mocked afterwards for the read.
const publishAgreementAsSiAdmin = async (
    scope: { studyId: string } | { orgId: string; type: 'DOPA' | 'ROPA' },
    signedAt: string,
) => {
    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(
        await createLegalDocumentDraftAction(
            'studyId' in scope
                ? { type: 'SLA', studyId: scope.studyId, fileName: 'agreement.pdf' }
                : { type: scope.type, orgId: scope.orgId, fileName: 'agreement.pdf' },
        ),
    )
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
}

const asOrgAdmin = (slug: string, orgType: 'enclave' | 'lab') =>
    mockSessionWithTestData({ orgSlug: slug, orgType, isAdmin: true })

const SORT = { columnAccessor: 'signedAt', direction: 'desc' } as const

describe('fetchOrgStudyAgreementsAction', () => {
    it('lists an approved study with no agreement yet, naming the Research Lab as the counterparty', async () => {
        const { study, dataPartner, researchLab } = await insertStudyWithDistinctOrgs({ title: 'Awaiting signature' })
        await asOrgAdmin(dataPartner.slug, 'enclave')

        const rows = actionResult(await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT }))
        const row = rows.find((candidate) => candidate.studyId === study.id)

        expect(row).toBeDefined()
        expect(row?.studyTitle).toBe('Awaiting signature')
        expect(row?.counterpartyName).toBe(researchLab.name)
        expect(row?.signedAt).toBeNull()
        expect(row?.versionId).toBeNull()
    })

    it('names the Data Partner as the counterparty for the Research Lab admin', async () => {
        const { study, dataPartner, researchLab } = await insertStudyWithDistinctOrgs()
        await asOrgAdmin(researchLab.slug, 'lab')

        const rows = actionResult(await fetchOrgStudyAgreementsAction({ orgSlug: researchLab.slug, sort: SORT }))

        expect(rows.find((candidate) => candidate.studyId === study.id)?.counterpartyName).toBe(dataPartner.name)
    })

    it('carries the signed date and the downloadable version once an agreement is published', async () => {
        const { study, dataPartner } = await insertStudyWithDistinctOrgs()
        const version = await publishAgreementAsSiAdmin({ studyId: study.id }, '2026-06-17')
        await asOrgAdmin(dataPartner.slug, 'enclave')

        const rows = actionResult(await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT }))
        const row = rows.find((candidate) => candidate.studyId === study.id)

        expect(row?.signedAt).toBe('2026-06-17')
        expect(row?.versionId).toBe(version.id)
    })

    it('shows only the latest published version, and one row per study', async () => {
        const { study, dataPartner } = await insertStudyWithDistinctOrgs()
        await publishAgreementAsSiAdmin({ studyId: study.id }, '2026-01-01')
        await publishAgreementAsSiAdmin({ studyId: study.id }, '2026-05-05')
        await asOrgAdmin(dataPartner.slug, 'enclave')

        const rows = actionResult(await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT }))
        const matching = rows.filter((candidate) => candidate.studyId === study.id)

        expect(matching).toHaveLength(1)
        expect(matching[0]?.signedAt).toBe('2026-05-05')
    })

    it('ignores an unpublished draft', async () => {
        const { study, dataPartner } = await insertStudyWithDistinctOrgs()
        await mockSessionWithTestData({ isSiAdmin: true })
        actionResult(await createLegalDocumentDraftAction({ type: 'SLA', studyId: study.id, fileName: 'draft.pdf' }))
        await asOrgAdmin(dataPartner.slug, 'enclave')

        const rows = actionResult(await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT }))
        const row = rows.find((candidate) => candidate.studyId === study.id)

        expect(row).toBeDefined()
        expect(row?.versionId).toBeNull()
    })

    it('omits a study that has not reached the agreement stage', async () => {
        const { study, dataPartner } = await insertStudyWithDistinctOrgs({ status: 'PENDING-REVIEW' })
        await asOrgAdmin(dataPartner.slug, 'enclave')

        const rows = actionResult(await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT }))

        expect(rows.find((candidate) => candidate.studyId === study.id)).toBeUndefined()
    })

    it('keeps a signed agreement listed after the study leaves APPROVED', async () => {
        const { study, dataPartner } = await insertStudyWithDistinctOrgs()
        await publishAgreementAsSiAdmin({ studyId: study.id }, '2026-03-03')
        await db.updateTable('study').set({ status: 'ARCHIVED' }).where('id', '=', study.id).execute()
        await asOrgAdmin(dataPartner.slug, 'enclave')

        const rows = actionResult(await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT }))

        expect(rows.find((candidate) => candidate.studyId === study.id)?.signedAt).toBe('2026-03-03')
    })

    it('omits a soft-deleted study even when an agreement was signed for it', async () => {
        const { study, dataPartner } = await insertStudyWithDistinctOrgs()
        await publishAgreementAsSiAdmin({ studyId: study.id }, '2026-03-03')
        await db.updateTable('study').set({ deletedAt: new Date() }).where('id', '=', study.id).execute()
        await asOrgAdmin(dataPartner.slug, 'enclave')

        const rows = actionResult(await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT }))

        expect(rows.find((candidate) => candidate.studyId === study.id)).toBeUndefined()
    })

    it('returns every study at the agreement stage, signed or not', async () => {
        const { dataPartner, researchLab } = await insertPartyOrgs()
        const insertStudy = async (title: string) =>
            (await insertTestStudyOnly({ org: dataPartner, submittedByOrg: researchLab, title })).study

        const signed = await insertStudy('Has an agreement')
        await insertStudy('Nothing signed')
        await publishAgreementAsSiAdmin({ studyId: signed.id }, '2026-02-02')
        await asOrgAdmin(dataPartner.slug, 'enclave')

        const rows = actionResult(await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT }))

        expect(rows.map((row) => row.studyTitle).sort()).toEqual(['Has an agreement', 'Nothing signed'])
        expect(rows.find((row) => row.studyTitle === 'Has an agreement')?.signedAt).toBe('2026-02-02')
        expect(rows.find((row) => row.studyTitle === 'Nothing signed')?.signedAt).toBeNull()
    })

    it('refuses an org the caller does not administer', async () => {
        const { dataPartner } = await insertStudyWithDistinctOrgs()
        await mockSessionWithTestData({ orgSlug: faker.string.alpha(10), orgType: 'enclave', isAdmin: true })

        const result = await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
    })

    it('refuses a member of the org who is not an admin', async () => {
        const { dataPartner } = await insertStudyWithDistinctOrgs()
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: false })

        const result = await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
    })

    it('lets an SI admin read any org', async () => {
        const { study, dataPartner } = await insertStudyWithDistinctOrgs()
        await mockSessionWithTestData({ isSiAdmin: true })

        const rows = actionResult(await fetchOrgStudyAgreementsAction({ orgSlug: dataPartner.slug, sort: SORT }))

        expect(rows.find((candidate) => candidate.studyId === study.id)).toBeDefined()
    })
})

describe('fetchOrgParticipationAgreementAction', () => {
    it('reports the DOPA as absent for an enclave with nothing on file', async () => {
        const { org } = await mockSessionWithTestData({
            orgSlug: faker.string.alpha(10),
            orgType: 'enclave',
            isAdmin: true,
        })

        const result = actionResult(await fetchOrgParticipationAgreementAction({ orgSlug: org.slug }))

        expect(result).toEqual({ type: 'DOPA', agreement: null })
    })

    it('derives ROPA from the org rather than the caller for a lab', async () => {
        const { org } = await mockSessionWithTestData({
            orgSlug: faker.string.alpha(10),
            orgType: 'lab',
            isAdmin: true,
        })
        const version = await publishAgreementAsSiAdmin({ orgId: org.id, type: 'ROPA' }, '2026-04-04')
        await asOrgAdmin(org.slug, 'lab')

        const result = actionResult(await fetchOrgParticipationAgreementAction({ orgSlug: org.slug }))

        expect(result.type).toBe('ROPA')
        expect(result.agreement?.signedAt).toBe('2026-04-04')
        expect(result.agreement?.versionId).toBe(version.id)
    })

    it('returns the latest published version', async () => {
        const { org } = await mockSessionWithTestData({
            orgSlug: faker.string.alpha(10),
            orgType: 'enclave',
            isAdmin: true,
        })
        await publishAgreementAsSiAdmin({ orgId: org.id, type: 'DOPA' }, '2026-01-01')
        await publishAgreementAsSiAdmin({ orgId: org.id, type: 'DOPA' }, '2026-07-07')
        await asOrgAdmin(org.slug, 'enclave')

        const result = actionResult(await fetchOrgParticipationAgreementAction({ orgSlug: org.slug }))

        expect(result.agreement?.signedAt).toBe('2026-07-07')
    })

    it('refuses an org the caller does not administer', async () => {
        const other = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        await mockSessionWithTestData({ orgSlug: faker.string.alpha(10), orgType: 'enclave', isAdmin: true })

        const result = await fetchOrgParticipationAgreementAction({ orgSlug: other.slug })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
    })
})
