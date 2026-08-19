import { sql } from 'kysely'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database'
import { createSignedUploadUrlForKey, signedUrlForFile } from '@/server/aws'
import {
    actionResult,
    faker,
    insertTestOrg,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
    resetLegalDocuments,
} from '@/tests/unit.helpers'
import {
    acknowledgeLegalDocumentAction,
    createLegalDocumentDraftAction,
    fetchLegalDocumentAcknowledgementsAction,
    fetchLegalDocumentVersionsAction,
    fetchNextPendingLegalAcknowledgementAction,
    fetchGlobalLegalDocumentsAction,
    publishLegalDocumentVersionAction,
} from './legal-document.actions'

// The upload happens client-side, so only the AWS boundary is stubbed; the rest hits the real DB.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        // Implementations are passed to vi.fn rather than set with mockResolvedValue: the suite runs
        // with mockReset, which restores the implementation given here but wipes a value set after.
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

// Document reads go through storage rather than calling S3 directly, and mocking `@/server/aws`
// does NOT reach storage's own import of it — storage keeps the unmocked binding — so the stub has
// to sit on the module the action actually calls. Echoing the key back as the body means a test
// asserting on content is asserting the right version's file was read; a fixed string would pass
// for any version.
vi.mock('@/server/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/storage')>()),
    fetchFileContents: vi.fn(async (path: string) => new Blob([`content of ${path}`])),
}))

// Version numbers and "nothing published yet" are assertions about the global tos/pn singletons, so
// the seeded documents on a dev database have to go first.
beforeEach(resetLegalDocuments)

const createDraft = async (fileName = 'terms.md') =>
    actionResult(await createLegalDocumentDraftAction({ type: 'TOS', fileName }))

const createOrgAgreementDraft = async (type: 'ROPA' | 'DOPA', fileName = 'agreement.pdf') => {
    const org = await insertTestOrg({ slug: faker.string.alpha(10), type: type === 'ROPA' ? 'lab' : 'enclave' })
    const draft = actionResult(await createLegalDocumentDraftAction({ type, orgId: org.id, fileName }))
    return { ...draft, org }
}

const publish = async (versionId: string, signedAt?: string) =>
    actionResult(await publishLegalDocumentVersionAction({ versionId, signedAt }))

describe('createLegalDocumentDraftAction', () => {
    it('creates the logical document and an unpublished draft, and returns an upload target', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        const { legalDocument, version } = await createDraft()

        expect(legalDocument.type).toBe('TOS')
        expect(legalDocument.orgId).toBeNull()
        expect(legalDocument.studyId).toBeNull()
        expect(version.publishedAt).toBeNull()
        expect(version.versionNumber).toBeNull()
        expect(version.filePath).toBe(`legal/TOS/${legalDocument.id}/${version.id}`)
        expect(version.fileName).toBe('terms.md')
        // Must be the exact key the stored file_path names, or the upload lands where no row points.
        expect(vi.mocked(createSignedUploadUrlForKey)).toHaveBeenCalledWith(version.filePath)
    })

    it('reuses the existing document rather than creating a second one for the same scope', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        const first = await createDraft()
        const second = await createDraft('terms-v2.md')

        expect(second.legalDocument.id).toBe(first.legalDocument.id)

        const documents = await db
            .selectFrom('legalDocument')
            .selectAll('legalDocument')
            .where('type', '=', 'TOS')
            .execute()
        expect(documents).toHaveLength(1)
    })

    it('replaces a pending draft so only one is ever outstanding', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        const first = await createDraft()
        const second = await createDraft('terms-v2.md')

        const drafts = await db
            .selectFrom('legalDocumentVersion')
            .selectAll('legalDocumentVersion')
            .where('legalDocumentId', '=', first.legalDocument.id)
            .where('publishedAt', 'is', null)
            .execute()

        expect(drafts).toHaveLength(1)
        expect(drafts[0]!.id).toBe(second.version.id)
    })

    it('rejects a global document that was given an organization', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await insertTestOrg({ slug: faker.string.alpha(10) })

        const result = await createLegalDocumentDraftAction({ type: 'TOS', orgId: org.id, fileName: 'terms.md' })

        expect(result).toHaveProperty('error')
    })

    it('rejects an org-scoped agreement with no organization', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        const result = await createLegalDocumentDraftAction({ type: 'ROPA', fileName: 'ropa.pdf' })

        expect(result).toHaveProperty('error')
    })

    // Derived rather than accepted, so a document cannot be stored in a format its viewer cannot read.
    it('stores the format its type is published in, whatever the file is called', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        const terms = await createDraft('terms.pdf')
        const { version: agreement } = await createOrgAgreementDraft('DOPA', 'dopa.md')

        expect(terms.version.format).toBe('markdown')
        expect(agreement.format).toBe('pdf')
    })

    it('denies a user who is not an SI admin', async () => {
        await mockSessionWithTestData()

        const result = await createLegalDocumentDraftAction({ type: 'TOS', fileName: 'terms.md' })

        expect(result).toHaveProperty('error')
    })
})

describe('publishLegalDocumentVersionAction', () => {
    it('numbers versions from one and records who published', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })

        const first = await publish((await createDraft()).version.id)
        expect(first.versionNumber).toBe(1)
        expect(first.publishedBy).toBe(user.id)
        expect(first.publishedAt).not.toBeNull()

        const second = await publish((await createDraft('terms-v2.md')).version.id)
        expect(second.versionNumber).toBe(2)
    })

    it('refuses to republish an already published version', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const versionId = (await createDraft()).version.id
        await publish(versionId)

        const result = await publishLegalDocumentVersionAction({ versionId })

        expect(result).toHaveProperty('error')
    })

    it('stores the signed date as the same calendar day it was given', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { version, org } = await createOrgAgreementDraft('ROPA')

        await publish(version.id, '2026-07-27')

        // Cast in SQL: reading through the driver would pass or fail depending on the machine's
        // timezone, which is the bug being guarded against.
        const row = await db
            .selectFrom('legalDocumentVersion')
            .select(sql<string>`signed_at::text`.as('signedAtText'))
            .where('id', '=', version.id)
            .executeTakeFirstOrThrow()

        expect(row.signedAtText).toBe('2026-07-27')

        // And the same day again on the way back out, where the driver would otherwise shift it.
        const { current } = actionResult(await fetchLegalDocumentVersionsAction({ type: 'ROPA', orgId: org.id }))
        expect(current?.signedAt).toBe('2026-07-27')
    })

    // Publishing cannot be undone, so a signed agreement with no signature date would be permanent.
    it('refuses to publish a signed agreement without the date it was signed', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { version } = await createOrgAgreementDraft('DOPA')

        const result = await publishLegalDocumentVersionAction({ versionId: version.id })

        expect(result).toHaveProperty('error')
    })

    it('refuses a signed date on a document that is published rather than signed', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const versionId = (await createDraft()).version.id

        const result = await publishLegalDocumentVersionAction({ versionId, signedAt: '2026-07-27' })

        expect(result).toHaveProperty('error')
    })

    it('denies a user who is not an SI admin', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const versionId = (await createDraft()).version.id

        await mockSessionWithTestData()
        const result = await publishLegalDocumentVersionAction({ versionId })

        expect(result).toHaveProperty('error')
    })
})

describe('fetchLegalDocumentVersionsAction', () => {
    it('reports nothing for a document that has never been uploaded', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        const result = actionResult(await fetchLegalDocumentVersionsAction({ type: 'PN' }))

        expect(result.legalDocumentId).toBeNull()
        expect(result.current).toBeNull()
        expect(result.history).toEqual([])
        expect(result.draft).toBeNull()
    })

    it('separates the current version, older versions, and a pending draft', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        await publish((await createDraft('v1.md')).version.id)
        await publish((await createDraft('v2.md')).version.id)
        const pending = await createDraft('v3.md')

        const result = actionResult(await fetchLegalDocumentVersionsAction({ type: 'TOS' }))

        expect(result.current?.versionNumber).toBe(2)
        expect(result.history.map((version) => version.versionNumber)).toEqual([1])
        expect(result.draft?.id).toBe(pending.version.id)
        expect(vi.mocked(signedUrlForFile)).toHaveBeenCalledWith(result.current!.filePath)
    })
})

describe('acknowledgeLegalDocumentAction', () => {
    it('records an acknowledgement of a published version', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        const published = await publish((await createDraft()).version.id)

        actionResult(await acknowledgeLegalDocumentAction({ versionId: published.id }))

        const acks = await db
            .selectFrom('legalDocumentAcknowledgement')
            .selectAll('legalDocumentAcknowledgement')
            .where('legalDocumentVersionId', '=', published.id)
            .execute()

        expect(acks).toHaveLength(1)
        expect(acks[0]!.userId).toBe(user.id)
    })

    it('is idempotent and keeps the original agreement time', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const published = await publish((await createDraft()).version.id)

        actionResult(await acknowledgeLegalDocumentAction({ versionId: published.id }))
        const first = await db
            .selectFrom('legalDocumentAcknowledgement')
            .selectAll('legalDocumentAcknowledgement')
            .where('legalDocumentVersionId', '=', published.id)
            .executeTakeFirstOrThrow()

        actionResult(await acknowledgeLegalDocumentAction({ versionId: published.id }))
        const acks = await db
            .selectFrom('legalDocumentAcknowledgement')
            .selectAll('legalDocumentAcknowledgement')
            .where('legalDocumentVersionId', '=', published.id)
            .execute()

        expect(acks).toHaveLength(1)
        expect(acks[0]!.ackedAt).toEqual(first.ackedAt)
    })

    // An acknowledgement is the compliance evidence, so a version id alone must not be enough to
    // record consent to an agreement that binds somebody else's organization.
    it('lets a member of the signing org acknowledge its participation agreement', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const slug = faker.string.alpha(10)
        const org = await insertTestOrg({ slug, type: 'enclave' })
        const { version } = actionResult(
            await createLegalDocumentDraftAction({ type: 'DOPA', orgId: org.id, fileName: 'dopa.pdf' }),
        )
        const published = await publish(version.id, '2026-07-27')

        // Same slug, so the helper reuses the org above and the user is a member of it.
        const { user } = await mockSessionWithTestData({ orgSlug: slug, orgType: 'enclave' })
        actionResult(await acknowledgeLegalDocumentAction({ versionId: published.id }))

        const acks = await db
            .selectFrom('legalDocumentAcknowledgement')
            .selectAll('legalDocumentAcknowledgement')
            .where('legalDocumentVersionId', '=', published.id)
            .execute()

        expect(acks).toHaveLength(1)
        expect(acks[0]!.userId).toBe(user.id)
    })

    it('refuses a user outside the org an agreement binds', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { version } = await createOrgAgreementDraft('DOPA')
        const published = await publish(version.id, '2026-07-27')

        await mockSessionWithTestData()
        const result = await acknowledgeLegalDocumentAction({ versionId: published.id })

        expect(result).toHaveProperty('error')
        const acks = await db
            .selectFrom('legalDocumentAcknowledgement')
            .selectAll('legalDocumentAcknowledgement')
            .where('legalDocumentVersionId', '=', published.id)
            .execute()
        expect(acks).toHaveLength(0)
    })

    // ropa = non-global but enforced
    it('refuses a user outside the org a ropa binds, though ropa is an enforced type', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { version } = await createOrgAgreementDraft('ROPA')
        const published = await publish(version.id, '2026-07-27')

        await mockSessionWithTestData()
        const result = await acknowledgeLegalDocumentAction({ versionId: published.id })

        expect(result).toHaveProperty('error')
        const acks = await db
            .selectFrom('legalDocumentAcknowledgement')
            .selectAll('legalDocumentAcknowledgement')
            .where('legalDocumentVersionId', '=', published.id)
            .execute()
        expect(acks).toHaveLength(0)
    })

    it('refuses to acknowledge a draft, which no one has been shown', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const draft = await createDraft()

        const result = await acknowledgeLegalDocumentAction({ versionId: draft.version.id })

        expect(result).toHaveProperty('error')
    })

    // The enforcement modal is shown to everyone, so this is the permission the whole card rests on.
    it('is allowed for a user who is not an SI admin', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const published = await publish((await createDraft()).version.id)

        const { user } = await mockSessionWithTestData()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: published.id }))

        const acks = await db
            .selectFrom('legalDocumentAcknowledgement')
            .selectAll('legalDocumentAcknowledgement')
            .where('legalDocumentVersionId', '=', published.id)
            .where('userId', '=', user.id)
            .execute()

        expect(acks).toHaveLength(1)
    })
})

const publishTos = async (fileName = 'terms.md') =>
    await publish(actionResult(await createLegalDocumentDraftAction({ type: 'TOS', fileName })).version.id)

const publishPn = async (fileName = 'privacy.md') =>
    await publish(actionResult(await createLegalDocumentDraftAction({ type: 'PN', fileName })).version.id)

describe('fetchNextPendingLegalAcknowledgementAction', () => {
    it('reports nothing when no document has been published', async () => {
        await mockSessionWithTestData()

        expect(actionResult(await fetchNextPendingLegalAcknowledgementAction())).toBeNull()
    })

    it('reports a published document the user has never acknowledged, with its content', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const tos = await publishTos()

        await mockSessionWithTestData()
        const pending = actionResult(await fetchNextPendingLegalAcknowledgementAction())

        expect(pending!.type).toBe('TOS')
        expect(pending!.versionId).toBe(tos.id)
        // A markdown tos inlines content, not a signed-url link.
        if (pending?.format !== 'markdown') throw new Error('expected a markdown body')
        expect(pending.content).toContain(tos.filePath)
        // Global tos/pn bind no org, so nothing to name.
        expect(pending.orgName).toBeNull()
        // Never acknowledged, so the modal must say "is now available" rather than "has been updated".
        expect(pending!.isUpdate).toBe(false)
    })

    it('reports nothing once the current version is acknowledged', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const tos = await publishTos()

        await mockSessionWithTestData()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: tos.id }))

        expect(actionResult(await fetchNextPendingLegalAcknowledgementAction())).toBeNull()
    })

    // The obligation is to the terms in force: acknowledging v1 does not settle v2, and v1 is never
    // asked for again. One SI-admin session throughout because mockSessionWithTestData mints a new
    // user each call — and an admin who publishes new terms does owe them, like everyone else.
    it('asks only for the current version, and marks it as an update', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        const first = await publishTos()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: first.id }))
        const second = await publishTos('terms-v2.md')

        const pending = actionResult(await fetchNextPendingLegalAcknowledgementAction())

        expect(pending!.versionId).toBe(second.id)
        expect(pending!.isUpdate).toBe(true)
    })

    it('ignores a draft, which obliges nobody', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await createLegalDocumentDraftAction({ type: 'TOS', fileName: 'terms.md' })

        await mockSessionWithTestData()

        expect(actionResult(await fetchNextPendingLegalAcknowledgementAction())).toBeNull()
    })

    // Ordering matters here because only the head is returned: the Privacy Notice is unreachable
    // until the Terms of Service is settled.
    it('asks for the Terms of Service before the Privacy Notice when both are outstanding', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await publishPn()
        const tos = await publishTos()

        await mockSessionWithTestData()
        expect(actionResult(await fetchNextPendingLegalAcknowledgementAction())!.type).toBe('TOS')

        actionResult(await acknowledgeLegalDocumentAction({ versionId: tos.id }))
        expect(actionResult(await fetchNextPendingLegalAcknowledgementAction())!.type).toBe('PN')
    })

    it('surfaces an org-scoped ropa to a member of the org it binds', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { version, org } = await createOrgAgreementDraft('ROPA')
        const published = await publish(version.id, '2026-07-27')

        await mockSessionWithTestData({ orgSlug: org.slug, orgType: 'lab' })
        const pending = actionResult(await fetchNextPendingLegalAcknowledgementAction())

        expect(pending!.type).toBe('ROPA')
        expect(pending!.versionId).toBe(published.id)
        expect(pending!.orgName).toBe(org.name)
        // A ropa is a pdf: a signed-url link, not inlined.
        if (pending?.format !== 'pdf') throw new Error('expected a pdf body')
        expect(pending.url).toBeTruthy()
    })

    // dopa is newly enforced, so its org's members must be asked too.
    it('surfaces an org-scoped dopa to a member of the org it binds', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { version, org } = await createOrgAgreementDraft('DOPA')
        const published = await publish(version.id, '2026-07-27')

        await mockSessionWithTestData({ orgSlug: org.slug, orgType: 'enclave' })
        const pending = actionResult(await fetchNextPendingLegalAcknowledgementAction())

        expect(pending!.type).toBe('DOPA')
        expect(pending!.versionId).toBe(published.id)
        expect(pending!.orgName).toBe(org.name)
        if (pending?.format !== 'pdf') throw new Error('expected a pdf body')
        expect(pending.url).toBeTruthy()
    })

    // A ropa binds only its org; an outsider owes it nothing, so the gate must not ask.
    it('does not surface an org-scoped agreement to a user outside its org', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { version } = await createOrgAgreementDraft('ROPA')
        await publish(version.id, '2026-07-27')

        await mockSessionWithTestData()
        expect(actionResult(await fetchNextPendingLegalAcknowledgementAction())).toBeNull()
    })

    // Global tos/pn precede org-scoped ones, so a member owing both gets tos first, ropa only after.
    it('asks for global tos before an org-scoped ropa the member also owes', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const tos = await publishTos()
        const { version, org } = await createOrgAgreementDraft('ROPA')
        const ropa = await publish(version.id, '2026-07-27')

        await mockSessionWithTestData({ orgSlug: org.slug, orgType: 'lab' })
        expect(actionResult(await fetchNextPendingLegalAcknowledgementAction())!.type).toBe('TOS')

        actionResult(await acknowledgeLegalDocumentAction({ versionId: tos.id }))
        const pending = actionResult(await fetchNextPendingLegalAcknowledgementAction())
        expect(pending!.type).toBe('ROPA')
        expect(pending!.versionId).toBe(ropa.id)
    })
})

describe('fetchGlobalLegalDocumentsAction', () => {
    it('returns the current published documents without a session', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await publishTos()
        const current = await publishTos('terms-v2.md')

        mockClerkSession(null)
        const documents = actionResult(await fetchGlobalLegalDocumentsAction())

        expect(documents.map((document) => document.versionId)).toEqual([current.id])
        // tos/pn are markdown, so the global set inlines content, not a link.
        const document = documents[0]!
        if (document.format !== 'markdown') throw new Error('expected a markdown body')
        expect(document.content).toContain(current.filePath)
    })
})

describe('fetchLegalDocumentAcknowledgementsAction', () => {
    it('lists a user with no acknowledgement as null', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        await publish((await createDraft()).version.id)

        const { users } = actionResult(await fetchLegalDocumentAcknowledgementsAction({ type: 'TOS' }))
        const row = users.find((candidate) => candidate.userId === user.id)

        expect(row?.acknowledgedVersionNumber).toBeNull()
        expect(row?.ackedAt).toBeNull()
    })

    it('reports the version a user agreed to and when', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        const published = await publish((await createDraft()).version.id)
        actionResult(await acknowledgeLegalDocumentAction({ versionId: published.id }))

        const { users } = actionResult(await fetchLegalDocumentAcknowledgementsAction({ type: 'TOS' }))
        const row = users.find((candidate) => candidate.userId === user.id)

        expect(row?.acknowledgedVersionNumber).toBe(1)
        expect(row?.ackedAt).toBeInstanceOf(Date)
    })

    it('reports the newest version when a user has acknowledged more than one', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        const v1 = await publish((await createDraft('v1.md')).version.id)
        actionResult(await acknowledgeLegalDocumentAction({ versionId: v1.id }))
        const v2 = await publish((await createDraft('v2.md')).version.id)
        actionResult(await acknowledgeLegalDocumentAction({ versionId: v2.id }))

        const { users } = actionResult(await fetchLegalDocumentAcknowledgementsAction({ type: 'TOS' }))
        const row = users.find((candidate) => candidate.userId === user.id)

        expect(row?.acknowledgedVersionNumber).toBe(2)
    })

    it('ignores acknowledgements of other documents', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        await publishPn()
        // Two tos versions so the tos acknowledgement outranks the privacy notice's on version number.
        await publishTos('terms-v1.md')
        const tosV2 = await publishTos('terms-v2.md')
        actionResult(await acknowledgeLegalDocumentAction({ versionId: tosV2.id }))

        const { users } = actionResult(await fetchLegalDocumentAcknowledgementsAction({ type: 'PN' }))
        const row = users.find((candidate) => candidate.userId === user.id)

        expect(row?.acknowledgedVersionNumber).toBeNull()
        expect(row?.ackedAt).toBeNull()
    })

    it('sorts users who never acknowledged last, whichever way the date column points', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        const published = await publishTos()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: published.id }))

        const positions = async (direction: 'asc' | 'desc') => {
            const { users } = actionResult(
                await fetchLegalDocumentAcknowledgementsAction({
                    type: 'TOS',
                    sort: { columnAccessor: 'ackedAt', direction },
                }),
            )
            return {
                acked: users.findIndex((candidate) => candidate.userId === user.id),
                neverAcked: users.findIndex((candidate) => candidate.ackedAt === null),
            }
        }

        const ascending = await positions('asc')
        const descending = await positions('desc')

        expect(ascending.acked).toBeLessThan(ascending.neverAcked)
        expect(descending.acked).toBeLessThan(descending.neverAcked)
    })

    it('collapses a user who belongs to several orgs into a single row', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const firstOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const secondOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({
            org: { id: firstOrg.id, slug: firstOrg.slug, type: firstOrg.type },
        })
        await db.insertInto('orgUser').values({ orgId: secondOrg.id, userId: user.id, isAdmin: false }).execute()

        const { users } = actionResult(await fetchLegalDocumentAcknowledgementsAction({ type: 'TOS' }))
        const rows = users.filter((candidate) => candidate.userId === user.id)

        expect(rows).toHaveLength(1)
        expect(rows[0]!.orgs.map((org) => org.name).sort()).toEqual([firstOrg.name, secondOrg.name].sort())
    })

    it('denies a user who is not an SI admin', async () => {
        await mockSessionWithTestData()

        const result = await fetchLegalDocumentAcknowledgementsAction({ type: 'TOS' })

        expect(result).toHaveProperty('error')
    })
})
