import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database'
import type { OrgType } from '@/database/types'
import {
    actionResult,
    faker,
    insertTestOrg,
    insertTestStudyOnly,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
    resetLegalDocuments,
} from '@/tests/unit.helpers'
import {
    acknowledgeLegalDocumentAction,
    createLegalDocumentDraftAction,
    fetchUserGlobalDocumentAction,
    fetchUserParticipationAgreementsAction,
    fetchUserStudyAgreementsAction,
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

// Mocking `@/server/aws` does not reach storage's own import of it. Echoing the key back as the
// body means a content assertion proves the right version's file was read.
vi.mock('@/server/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/storage')>()),
    fetchFileContents: vi.fn(async (path: string) => new Blob([`content of ${path}`])),
}))

// The seeded documents on a dev database would break assertions about the tos/pn singletons.
beforeEach(resetLegalDocuments)

const publishAsSiAdmin = async (
    scope: { type: 'SLA'; studyId: string } | { type: 'DOPA' | 'ROPA'; orgId: string } | { type: 'TOS' | 'PN' },
    signedAt?: string,
) => {
    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(await createLegalDocumentDraftAction({ ...scope, fileName: 'agreement.pdf' }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
}

type Reader = Awaited<ReturnType<typeof insertReader>>

const insertReader = async (orgType: OrgType) => {
    const { user, org, restoreSession } = await mockSessionWithTestData({ orgType })
    return { user, org, orgName: org.name, restoreSession }
}

const STUDY_SORT = { columnAccessor: 'ackedAt', direction: 'desc' } as const
const PARTICIPATION_SORT = { columnAccessor: 'ackedAt', direction: 'desc' } as const

describe('fetchUserStudyAgreementsAction', () => {
    // Distinct orgs on each side, so a swapped From/To join cannot pass.
    const insertStudyForReader = async (reader: Reader, title = 'A study') => {
        const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { study } = await insertTestStudyOnly({
            org: reader.org,
            submittedByOrg: researchLab,
            title,
            status: 'APPROVED',
        })
        return { study, researchLab }
    }

    it('returns nothing until the user acknowledges', async () => {
        const reader = await insertReader('enclave')
        const { study } = await insertStudyForReader(reader)
        await publishAsSiAdmin({ type: 'SLA', studyId: study.id }, '2026-06-17')
        reader.restoreSession()

        const rows = actionResult(await fetchUserStudyAgreementsAction({ sort: STUDY_SORT }))

        expect(rows).toEqual([])
    })

    it('names the Research Lab as From and the Data Partner as To', async () => {
        const reader = await insertReader('enclave')
        const { study, researchLab } = await insertStudyForReader(reader, 'Teacher feedback timing')
        const version = await publishAsSiAdmin({ type: 'SLA', studyId: study.id }, '2026-06-17')
        reader.restoreSession()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))

        const rows = actionResult(await fetchUserStudyAgreementsAction({ sort: STUDY_SORT }))

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            studyId: study.id,
            studyTitle: 'Teacher feedback timing',
            fromName: researchLab.name,
            toName: reader.orgName,
            signedAt: '2026-06-17',
            versionId: version.id,
        })
        expect(rows[0]?.ackedAt).toBeInstanceOf(Date)
    })

    it('keeps one row per study, carrying the latest version the user acknowledged', async () => {
        const reader = await insertReader('enclave')
        const { study } = await insertStudyForReader(reader)

        const first = await publishAsSiAdmin({ type: 'SLA', studyId: study.id }, '2026-01-01')
        reader.restoreSession()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: first.id }))

        const second = await publishAsSiAdmin({ type: 'SLA', studyId: study.id }, '2026-05-05')
        reader.restoreSession()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: second.id }))

        const rows = actionResult(await fetchUserStudyAgreementsAction({ sort: STUDY_SORT }))

        expect(rows).toHaveLength(1)
        expect(rows[0]?.signedAt).toBe('2026-05-05')
    })

    it('shows the version the user acknowledged, not a newer published one', async () => {
        const reader = await insertReader('enclave')
        const { study } = await insertStudyForReader(reader)

        const first = await publishAsSiAdmin({ type: 'SLA', studyId: study.id }, '2026-01-01')
        reader.restoreSession()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: first.id }))

        await publishAsSiAdmin({ type: 'SLA', studyId: study.id }, '2026-08-08')
        reader.restoreSession()

        const rows = actionResult(await fetchUserStudyAgreementsAction({ sort: STUDY_SORT }))

        expect(rows[0]?.signedAt).toBe('2026-01-01')
    })

    it('does not leak another user in the same org', async () => {
        const reader = await insertReader('enclave')
        const { study } = await insertStudyForReader(reader)
        const version = await publishAsSiAdmin({ type: 'SLA', studyId: study.id }, '2026-06-17')

        const { user: colleague } = await insertTestUser({ org: reader.org })
        await db
            .insertInto('legalDocumentAcknowledgement')
            .values({ legalDocumentVersionId: version.id, userId: colleague.id })
            .execute()

        reader.restoreSession()

        expect(actionResult(await fetchUserStudyAgreementsAction({ sort: STUDY_SORT }))).toEqual([])
    })

    it('keeps the agreement listed after the study leaves APPROVED', async () => {
        const reader = await insertReader('enclave')
        const { study } = await insertStudyForReader(reader)
        const version = await publishAsSiAdmin({ type: 'SLA', studyId: study.id }, '2026-03-03')
        reader.restoreSession()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))
        await db.updateTable('study').set({ status: 'ARCHIVED' }).where('id', '=', study.id).execute()

        const rows = actionResult(await fetchUserStudyAgreementsAction({ sort: STUDY_SORT }))

        expect(rows[0]?.signedAt).toBe('2026-03-03')
    })

    it('breaks a tie on title ascending whichever way the chosen column points', async () => {
        const reader = await insertReader('enclave')
        for (const title of ['Zulu study', 'Alpha study']) {
            const { study } = await insertStudyForReader(reader, title)
            const version = await publishAsSiAdmin({ type: 'SLA', studyId: study.id }, '2026-04-04')
            reader.restoreSession()
            actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))
        }

        const titlesSortedBy = async (direction: 'asc' | 'desc') =>
            actionResult(await fetchUserStudyAgreementsAction({ sort: { columnAccessor: 'signedAt', direction } })).map(
                (row) => row.studyTitle,
            )

        expect(await titlesSortedBy('asc')).toEqual(['Alpha study', 'Zulu study'])
        expect(await titlesSortedBy('desc')).toEqual(['Alpha study', 'Zulu study'])
    })

    // The mocked auth() returns undefined where Clerk's returns an object, so this throws rather
    // than denying permission. What matters is that it never returns rows.
    it('refuses a caller with no session', async () => {
        mockClerkSession(null)

        expect(await fetchUserStudyAgreementsAction({ sort: STUDY_SORT })).toEqual({ error: expect.anything() })
    })
})

describe('fetchUserParticipationAgreementsAction', () => {
    const acknowledgeParticipation = async (reader: Reader, type: 'DOPA' | 'ROPA', signedAt: string) => {
        const version = await publishAsSiAdmin({ type, orgId: reader.org.id }, signedAt)
        reader.restoreSession()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))
        return version
    }

    it('returns the acknowledged DOPA with the organization name', async () => {
        const reader = await insertReader('enclave')
        const version = await acknowledgeParticipation(reader, 'DOPA', '2026-04-04')

        const rows = actionResult(
            await fetchUserParticipationAgreementsAction({ type: 'DOPA', sort: PARTICIPATION_SORT }),
        )

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            orgId: reader.org.id,
            orgName: reader.orgName,
            signedAt: '2026-04-04',
            versionId: version.id,
        })
    })

    it('keeps the two types apart', async () => {
        const reader = await insertReader('enclave')
        await acknowledgeParticipation(reader, 'DOPA', '2026-04-04')

        expect(
            actionResult(await fetchUserParticipationAgreementsAction({ type: 'ROPA', sort: PARTICIPATION_SORT })),
        ).toEqual([])
    })

    it('returns a ROPA for a lab member', async () => {
        const reader = await insertReader('lab')
        await acknowledgeParticipation(reader, 'ROPA', '2026-02-02')

        const rows = actionResult(
            await fetchUserParticipationAgreementsAction({ type: 'ROPA', sort: PARTICIPATION_SORT }),
        )

        expect(rows).toHaveLength(1)
        expect(rows[0]?.signedAt).toBe('2026-02-02')
    })

    it('still lists an agreement signed at an org the user has since left', async () => {
        const reader = await insertReader('enclave')
        await acknowledgeParticipation(reader, 'DOPA', '2026-04-04')
        await db.deleteFrom('orgUser').where('userId', '=', reader.user.id).execute()
        reader.restoreSession()

        expect(
            actionResult(await fetchUserParticipationAgreementsAction({ type: 'DOPA', sort: PARTICIPATION_SORT })),
        ).toHaveLength(1)
    })

    it('rejects a type that is not a participation agreement', async () => {
        await insertReader('enclave')

        // @ts-expect-error the schema rejects it; this proves the runtime does too.
        const result = await fetchUserParticipationAgreementsAction({ type: 'TOS' })

        expect(result).toEqual({ error: expect.anything() })
    })
})

describe('fetchUserGlobalDocumentAction', () => {
    it('returns null when nothing is published', async () => {
        await insertReader('enclave')

        expect(actionResult(await fetchUserGlobalDocumentAction({ type: 'TOS' }))).toBeNull()
    })

    it('returns the latest published version with its content and the acknowledgement date', async () => {
        const reader = await insertReader('enclave')
        const version = await publishAsSiAdmin({ type: 'TOS' })
        reader.restoreSession()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))

        const document = actionResult(await fetchUserGlobalDocumentAction({ type: 'TOS' }))

        expect(document?.versionId).toBe(version.id)
        expect(document?.format).toBe('markdown')
        expect(document && 'content' in document && document.content).toBe(`content of ${version.filePath}`)
        expect(document?.publishedAt).toBeInstanceOf(Date)
        expect(document?.ackedAt).toBeInstanceOf(Date)
    })

    // The login gate is client-side and fails open on a read error, so this state is reachable.
    it('reports a null acknowledgement date when the user owes the current version', async () => {
        const reader = await insertReader('enclave')
        const first = await publishAsSiAdmin({ type: 'TOS' })
        reader.restoreSession()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: first.id }))

        const second = await publishAsSiAdmin({ type: 'TOS' })
        reader.restoreSession()

        const document = actionResult(await fetchUserGlobalDocumentAction({ type: 'TOS' }))

        expect(document?.versionId).toBe(second.id)
        expect(document?.ackedAt).toBeNull()
    })

    it('keeps the Terms of Service and the Privacy Notice apart', async () => {
        const reader = await insertReader('enclave')
        const tos = await publishAsSiAdmin({ type: 'TOS' })
        reader.restoreSession()

        expect(actionResult(await fetchUserGlobalDocumentAction({ type: 'PN' }))).toBeNull()
        expect(actionResult(await fetchUserGlobalDocumentAction({ type: 'TOS' }))?.versionId).toBe(tos.id)
    })

    it('rejects an org-scoped type', async () => {
        await insertReader('enclave')

        // @ts-expect-error the schema rejects it; this proves the runtime does too.
        const result = await fetchUserGlobalDocumentAction({ type: 'DOPA' })

        expect(result).toEqual({ error: expect.anything() })
    })
})
