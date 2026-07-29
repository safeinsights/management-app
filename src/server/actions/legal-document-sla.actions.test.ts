import { describe, expect, it, vi } from 'vitest'
import { db } from '@/database'
import { signedUrlForFile } from '@/server/aws'
import { actionResult, faker, insertTestOrg, insertTestUser, mockSessionWithTestData } from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    fetchStudiesAwaitingSlaAction,
    fetchStudyLevelAgreementsAction,
    publishLegalDocumentVersionAction,
} from './legal-document.actions'
import type { StudyStatus } from '@/database/types'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn().mockResolvedValue('https://mock-signed-url.example.com/file'),
        createSignedUploadUrl: vi.fn().mockResolvedValue({ url: 'https://mock-s3.example.com', fields: { key: 'k' } }),
    }
})

// The shared helpers put both of a study's orgs on one org, which would hide a swapped join.
// study.orgId is the enclave (Data Partner), study.submittedByOrgId is the lab (Research Lab).
const insertStudyWithDistinctOrgs = async ({ status = 'APPROVED' as StudyStatus, title = 'A study' } = {}) => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { user: researcher } = await insertTestUser({
        org: { id: researchLab.id, slug: researchLab.slug, type: 'lab' },
    })

    const study = await db
        .insertInto('study')
        .values({
            orgId: dataPartner.id,
            submittedByOrgId: researchLab.id,
            containerLocation: 'test-container',
            title,
            researcherId: researcher.id,
            piName: 'test',
            status,
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: 'R',
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    return { study, dataPartner, researchLab }
}

const uploadAndPublishSla = async (studyId: string, signedAt: string, fileName = 'sla.pdf') => {
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type: 'sla', studyId, fileName, format: 'pdf' }),
    )
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
}

describe('fetchStudiesAwaitingSlaAction', () => {
    it('offers an approved study with its Data Partner and Research Lab correctly assigned', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { study, dataPartner, researchLab } = await insertStudyWithDistinctOrgs({ title: 'Needs an SLA' })

        const candidates = actionResult(await fetchStudiesAwaitingSlaAction())
        const row = candidates.find((candidate) => candidate.studyId === study.id)

        expect(row).toBeDefined()
        expect(row?.studyTitle).toBe('Needs an SLA')
        expect(row?.dataPartnerId).toBe(dataPartner.id)
        expect(row?.dataPartnerName).toBe(dataPartner.name)
        expect(row?.researchLabId).toBe(researchLab.id)
        expect(row?.researchLabName).toBe(researchLab.name)
    })

    it('drops a study once it has an SLA, so the same one cannot be uploaded twice', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { study } = await insertStudyWithDistinctOrgs()

        const before = actionResult(await fetchStudiesAwaitingSlaAction())
        expect(before.some((candidate) => candidate.studyId === study.id)).toBe(true)

        await uploadAndPublishSla(study.id, '2026-07-27')

        const after = actionResult(await fetchStudiesAwaitingSlaAction())
        expect(after.some((candidate) => candidate.studyId === study.id)).toBe(false)
    })

    it('ignores studies that have not been approved, since there is nothing signed yet', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { study } = await insertStudyWithDistinctOrgs({ status: 'PENDING-REVIEW' })

        const candidates = actionResult(await fetchStudiesAwaitingSlaAction())

        expect(candidates.some((candidate) => candidate.studyId === study.id)).toBe(false)
    })

    it('denies a user who is not an SI admin', async () => {
        await mockSessionWithTestData()

        expect(await fetchStudiesAwaitingSlaAction()).toHaveProperty('error')
    })
})

describe('fetchStudyLevelAgreementsAction', () => {
    it('lists a published SLA with its study, orgs and signed date', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { study, dataPartner, researchLab } = await insertStudyWithDistinctOrgs({ title: 'Signed study' })
        await uploadAndPublishSla(study.id, '2026-07-27')

        const rows = actionResult(await fetchStudyLevelAgreementsAction())
        const row = rows.find((candidate) => candidate.studyId === study.id)

        expect(row?.studyTitle).toBe('Signed study')
        expect(row?.researchLabName).toBe(researchLab.name)
        expect(row?.dataPartnerName).toBe(dataPartner.name)
        expect(row?.versionNumber).toBe(1)
        // Must be signed from this row's own key, not another version's.
        expect(vi.mocked(signedUrlForFile)).toHaveBeenCalledWith(row!.filePath)
    })

    it('leaves out an SLA that has only been drafted, not published', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { study } = await insertStudyWithDistinctOrgs()
        actionResult(
            await createLegalDocumentDraftAction({
                type: 'sla',
                studyId: study.id,
                fileName: 'sla.pdf',
                format: 'pdf',
            }),
        )

        const rows = actionResult(await fetchStudyLevelAgreementsAction())

        expect(rows.some((candidate) => candidate.studyId === study.id)).toBe(false)
    })

    it('shows only the newest published version for a study', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { study } = await insertStudyWithDistinctOrgs()
        await uploadAndPublishSla(study.id, '2026-07-01', 'sla-v1.pdf')
        await uploadAndPublishSla(study.id, '2026-07-27', 'sla-v2.pdf')

        const rows = actionResult(await fetchStudyLevelAgreementsAction())
        const forStudy = rows.filter((candidate) => candidate.studyId === study.id)

        expect(forStudy).toHaveLength(1)
        expect(forStudy[0]!.versionNumber).toBe(2)
    })

    it('denies a user who is not an SI admin', async () => {
        await mockSessionWithTestData()

        expect(await fetchStudyLevelAgreementsAction()).toHaveProperty('error')
    })
})
