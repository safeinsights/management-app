import { sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/database'
import { createSignedUploadUrl, signedUrlForFile } from '@/server/aws'
import { actionResult, faker, insertTestOrg, insertTestUser, mockSessionWithTestData } from '@/tests/unit.helpers'
import {
    acknowledgeLegalDocumentAction,
    createLegalDocumentDraftAction,
    fetchLegalDocumentAcknowledgementsAction,
    fetchLegalDocumentVersionsAction,
    publishLegalDocumentVersionAction,
} from './legal-document.actions'

// These actions only hand the browser a presigned URL — the upload itself happens client-side — so
// the AWS boundary is stubbed and every assertion below is about real database state.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn().mockResolvedValue('https://mock-signed-url.example.com/file'),
        createSignedUploadUrl: vi.fn().mockResolvedValue({ url: 'https://mock-s3.example.com', fields: { key: 'k' } }),
    }
})

const createDraft = async (fileName = 'terms.md') =>
    actionResult(await createLegalDocumentDraftAction({ type: 'tos', fileName, format: 'markdown' }))

const publish = async (versionId: string, signedAt?: string) =>
    actionResult(await publishLegalDocumentVersionAction({ versionId, signedAt }))

describe('createLegalDocumentDraftAction', () => {
    it('creates the logical document and an unpublished draft, and returns an upload target', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        const { legalDocument, version } = await createDraft()

        expect(legalDocument.type).toBe('tos')
        expect(legalDocument.orgId).toBeNull()
        expect(legalDocument.studyId).toBeNull()
        expect(version.publishedAt).toBeNull()
        expect(version.versionNumber).toBeNull()
        expect(version.filePath).toBe(`legal/tos/${legalDocument.id}/${version.id}/terms.md`)
        // The presigned prefix has to be the directory the stored file_path sits in, otherwise the
        // upload lands somewhere the row does not point at.
        expect(vi.mocked(createSignedUploadUrl)).toHaveBeenCalledWith(`legal/tos/${legalDocument.id}/${version.id}`)
    })

    it('reuses the existing document rather than creating a second one for the same scope', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        const first = await createDraft()
        const second = await createDraft('terms-v2.md')

        expect(second.legalDocument.id).toBe(first.legalDocument.id)

        const documents = await db
            .selectFrom('legalDocument')
            .selectAll('legalDocument')
            .where('type', '=', 'tos')
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

        const result = await createLegalDocumentDraftAction({
            type: 'tos',
            orgId: org.id,
            fileName: 'terms.md',
            format: 'markdown',
        })

        expect(result).toHaveProperty('error')
    })

    it('rejects an org-scoped agreement with no organization', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        const result = await createLegalDocumentDraftAction({ type: 'ropa', fileName: 'ropa.pdf', format: 'pdf' })

        expect(result).toHaveProperty('error')
    })

    it('denies a user who is not an SI admin', async () => {
        await mockSessionWithTestData()

        const result = await createLegalDocumentDraftAction({ type: 'tos', fileName: 'terms.md', format: 'markdown' })

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
        const versionId = (await createDraft('ropa.pdf')).version.id

        await publish(versionId, '2026-07-27')

        // Cast in SQL rather than reading the parsed value: node-postgres turns a `date` into a JS
        // Date at local midnight, so asserting through the driver would pass or fail depending on the
        // machine's timezone. This checks what is actually stored.
        const row = await db
            .selectFrom('legalDocumentVersion')
            .select(sql<string>`signed_at::text`.as('signedAtText'))
            .where('id', '=', versionId)
            .executeTakeFirstOrThrow()

        expect(row.signedAtText).toBe('2026-07-27')
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

        const result = actionResult(await fetchLegalDocumentVersionsAction({ type: 'pn' }))

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

        const result = actionResult(await fetchLegalDocumentVersionsAction({ type: 'tos' }))

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

    it('refuses to acknowledge a draft, which no one has been shown', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const draft = await createDraft()

        const result = await acknowledgeLegalDocumentAction({ versionId: draft.version.id })

        expect(result).toHaveProperty('error')
    })
})

describe('fetchLegalDocumentAcknowledgementsAction', () => {
    it('lists a user with no acknowledgement as null', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        await publish((await createDraft()).version.id)

        const { users } = actionResult(await fetchLegalDocumentAcknowledgementsAction({ type: 'tos' }))
        const row = users.find((candidate) => candidate.userId === user.id)

        expect(row?.acknowledgedVersionNumber).toBeNull()
        expect(row?.ackedAt).toBeNull()
    })

    it('reports the version a user agreed to and when', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        const published = await publish((await createDraft()).version.id)
        actionResult(await acknowledgeLegalDocumentAction({ versionId: published.id }))

        const { users } = actionResult(await fetchLegalDocumentAcknowledgementsAction({ type: 'tos' }))
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

        const { users } = actionResult(await fetchLegalDocumentAcknowledgementsAction({ type: 'tos' }))
        const row = users.find((candidate) => candidate.userId === user.id)

        expect(row?.acknowledgedVersionNumber).toBe(2)
    })

    it('collapses a user who belongs to several orgs into a single row', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const firstOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const secondOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({
            org: { id: firstOrg.id, slug: firstOrg.slug, type: firstOrg.type },
        })
        await db.insertInto('orgUser').values({ orgId: secondOrg.id, userId: user.id, isAdmin: false }).execute()

        const { users } = actionResult(await fetchLegalDocumentAcknowledgementsAction({ type: 'tos' }))
        const rows = users.filter((candidate) => candidate.userId === user.id)

        expect(rows).toHaveLength(1)
        expect(rows[0]!.orgs.map((org) => org.name).sort()).toEqual([firstOrg.name, secondOrg.name].sort())
    })

    it('denies a user who is not an SI admin', async () => {
        await mockSessionWithTestData()

        const result = await fetchLegalDocumentAcknowledgementsAction({ type: 'tos' })

        expect(result).toHaveProperty('error')
    })
})
