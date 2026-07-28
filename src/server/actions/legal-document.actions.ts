'use server'

import { v7 as uuidv7 } from 'uuid'
import type { DBExecutor } from '@/database'
import type { LegalDocumentType } from '@/database/types'
import { pathForLegalDocumentVersion, pathForLegalDocumentVersionFile } from '@/lib/paths'
import {
    acknowledgeLegalDocumentSchema,
    createLegalDocumentDraftSchema,
    fetchLegalDocumentAcknowledgementsSchema,
    legalDocumentScopeSchema,
    publishLegalDocumentVersionSchema,
} from '@/schema/legal-document'
import { createSignedUploadUrl, signedUrlForFile } from '../aws'
import { Action, ActionFailure } from './action'

type DocumentScope = { type: LegalDocumentType; orgId?: string; studyId?: string }

// Resolves a version's document scope into the context so the ability check has something to match
// on, and so a later rule can scope publishing/acknowledging to a single org or study without
// touching the actions themselves.
const scopeFromVersionId = async ({ params: { versionId }, db }: { params: { versionId: string }; db: DBExecutor }) => {
    const scope = await db
        .selectFrom('legalDocumentVersion')
        .innerJoin('legalDocument', 'legalDocument.id', 'legalDocumentVersion.legalDocumentId')
        .select(['legalDocument.orgId as orgId', 'legalDocument.studyId as studyId'])
        .where('legalDocumentVersion.id', '=', versionId)
        .executeTakeFirst()

    return { orgId: scope?.orgId ?? undefined, studyId: scope?.studyId ?? undefined }
}

// ToS/PN are global, so their scope columns are null rather than absent — `is null` matches the rows
// the NULLS NOT DISTINCT unique constraint keeps to one per scope.
const findDocument = (db: DBExecutor, { type, orgId, studyId }: DocumentScope) =>
    db
        .selectFrom('legalDocument')
        .selectAll('legalDocument')
        .where('type', '=', type)
        .where((eb) => (orgId ? eb('orgId', '=', orgId) : eb('orgId', 'is', null)))
        .where((eb) => (studyId ? eb('studyId', '=', studyId) : eb('studyId', 'is', null)))
        .executeTakeFirst()

export const createLegalDocumentDraftAction = new Action('createLegalDocumentDraftAction', {
    performsMutations: true,
})
    .params(createLegalDocumentDraftSchema)
    .requireAbilityTo('create', 'LegalDocument')
    .handler(async ({ db, params: { type, orgId, studyId, fileName, format } }) => {
        // The logical document is created on first upload rather than seeded, so there is nothing to
        // keep in sync; the unique constraint guarantees at most one per scope. onConflict covers the
        // case where a concurrent upload created it a moment ago.
        const legalDocument =
            (await db
                .insertInto('legalDocument')
                .values({ type, orgId: orgId ?? null, studyId: studyId ?? null })
                .onConflict((oc) => oc.constraint('legal_document_scope_unique').doNothing())
                .returningAll()
                .executeTakeFirst()) ?? (await findDocument(db, { type, orgId, studyId }))

        if (!legalDocument) throw new ActionFailure({ document: 'could not be created' })

        // Only one unpublished draft may exist at a time (enforced by a partial unique index), so a
        // fresh upload supersedes any pending one. The superseded draft's S3 object is left in place:
        // deleting it here would be an un-rollbackable side effect inside this transaction, and it is
        // unreachable anyway since every version uploads under its own id.
        await db
            .deleteFrom('legalDocumentVersion')
            .where('legalDocumentId', '=', legalDocument.id)
            .where('publishedAt', 'is', null)
            .execute()

        // The id is generated here so the S3 prefix and the stored file_path agree without a second
        // round-trip after the insert.
        const versionId = uuidv7()
        const pathParts = { type, legalDocumentId: legalDocument.id, versionId }

        const version = await db
            .insertInto('legalDocumentVersion')
            .values({
                id: versionId,
                legalDocumentId: legalDocument.id,
                filePath: pathForLegalDocumentVersionFile(pathParts, fileName),
                format,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        return {
            legalDocument,
            version,
            // createSignedUploadUrl takes a prefix and appends the uploaded file's name, which is why
            // file_path above is built from the same fileName the client is about to upload.
            upload: await createSignedUploadUrl(pathForLegalDocumentVersion(pathParts)),
        }
    })

export const publishLegalDocumentVersionAction = new Action('publishLegalDocumentVersionAction', {
    performsMutations: true,
})
    .params(publishLegalDocumentVersionSchema)
    .middleware(scopeFromVersionId)
    .requireAbilityTo('publish', 'LegalDocument')
    .handler(async ({ db, params: { versionId, signedAt }, session }) => {
        const version = await db
            .selectFrom('legalDocumentVersion')
            .selectAll('legalDocumentVersion')
            .where('id', '=', versionId)
            .executeTakeFirstOrThrow()

        if (version.publishedAt) {
            throw new ActionFailure({ version: 'has already been published and cannot be republished' })
        }

        const { maxVersion } = await db
            .selectFrom('legalDocumentVersion')
            .select((eb) => eb.fn.max('versionNumber').as('maxVersion'))
            .where('legalDocumentId', '=', version.legalDocumentId)
            .executeTakeFirstOrThrow()

        // The `publishedAt is null` guard makes a concurrent second publish claim zero rows and throw
        // rather than overwrite the first; the unique (legalDocumentId, versionNumber) constraint
        // catches two different drafts racing for the same number.
        return await db
            .updateTable('legalDocumentVersion')
            .set({
                publishedAt: new Date(),
                publishedBy: session.user.id,
                versionNumber: Number(maxVersion ?? 0) + 1,
                signedAt: signedAt ?? null,
            })
            .where('id', '=', versionId)
            .where('publishedAt', 'is', null)
            .returningAll()
            .executeTakeFirstOrThrow()
    })

export const fetchLegalDocumentVersionsAction = new Action('fetchLegalDocumentVersionsAction')
    .params(legalDocumentScopeSchema)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db, params: { type, orgId, studyId } }) => {
        const legalDocument = await findDocument(db, { type, orgId, studyId })
        if (!legalDocument) return { legalDocumentId: null, current: null, history: [], draft: null }

        const rows = await db
            .selectFrom('legalDocumentVersion')
            .leftJoin('user', 'user.id', 'legalDocumentVersion.publishedBy')
            .select([
                'legalDocumentVersion.id',
                'legalDocumentVersion.versionNumber',
                'legalDocumentVersion.filePath',
                'legalDocumentVersion.format',
                'legalDocumentVersion.publishedAt',
                'legalDocumentVersion.signedAt',
                'legalDocumentVersion.createdAt',
                'user.fullName as publishedByName',
            ])
            .where('legalDocumentId', '=', legalDocument.id)
            .orderBy('legalDocumentVersion.versionNumber', 'desc')
            .execute()

        const withUrls = await Promise.all(
            rows.map(async (row) => ({ ...row, downloadUrl: await signedUrlForFile(row.filePath) })),
        )
        const published = withUrls.filter((row) => row.publishedAt !== null)

        return {
            legalDocumentId: legalDocument.id,
            current: published[0] ?? null,
            history: published.slice(1),
            draft: withUrls.find((row) => row.publishedAt === null) ?? null,
        }
    })

export const acknowledgeLegalDocumentAction = new Action('acknowledgeLegalDocumentAction', {
    performsMutations: true,
})
    .params(acknowledgeLegalDocumentSchema)
    .middleware(scopeFromVersionId)
    .requireAbilityTo('acknowledge', 'LegalDocument')
    .handler(async ({ db, params: { versionId }, session }) => {
        const version = await db
            .selectFrom('legalDocumentVersion')
            .select(['id', 'publishedAt'])
            .where('id', '=', versionId)
            .executeTakeFirstOrThrow()

        // A draft has not gone live, so agreeing to it would record consent to something no one was
        // shown.
        if (!version.publishedAt) {
            throw new ActionFailure({ version: 'is not published and cannot be acknowledged' })
        }

        // Re-submitting keeps the original acked_at: the first agreement is the one that happened.
        await db
            .insertInto('legalDocumentAcknowledgement')
            .values({ legalDocumentVersionId: versionId, userId: session.user.id })
            .onConflict((oc) => oc.constraint('legal_document_acknowledgement_unique').doNothing())
            .execute()

        return { acknowledged: true }
    })

export const fetchLegalDocumentAcknowledgementsAction = new Action('fetchLegalDocumentAcknowledgementsAction')
    .params(fetchLegalDocumentAcknowledgementsSchema)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db, params: { type, orgId, studyId, sort } }) => {
        const legalDocument = await findDocument(db, { type, orgId, studyId })

        // Who is *required* to acknowledge is derived, not stored. For ToS/PN that is every user; a
        // missing acknowledgement row is what "has not agreed" looks like, which is also why this
        // list legitimately reads as all-null until something is published and acknowledged.
        const memberships = await db
            .selectFrom('user')
            .leftJoin('orgUser', 'orgUser.userId', 'user.id')
            .leftJoin('org', 'org.id', 'orgUser.orgId')
            .select(['user.id', 'user.fullName', 'user.email', 'org.name as orgName', 'org.type as orgType'])
            .execute()

        const acknowledgements = legalDocument
            ? await db
                  .selectFrom('legalDocumentAcknowledgement')
                  .innerJoin(
                      'legalDocumentVersion',
                      'legalDocumentVersion.id',
                      'legalDocumentAcknowledgement.legalDocumentVersionId',
                  )
                  .select([
                      'legalDocumentAcknowledgement.userId',
                      'legalDocumentAcknowledgement.ackedAt',
                      'legalDocumentVersion.versionNumber',
                  ])
                  // Newest acknowledged version per user; distinctOn keeps the first row of each
                  // userId group, matching the pattern in getUsersForOrgAction.
                  .distinctOn('legalDocumentAcknowledgement.userId')
                  .orderBy('legalDocumentAcknowledgement.userId')
                  .orderBy('legalDocumentVersion.versionNumber', 'desc')
                  .execute()
            : []

        const latestByUser = new Map(acknowledgements.map((ack) => [ack.userId, ack]))

        // A user can belong to several orgs, so memberships are collapsed into one row per user
        // rather than repeating the person once per org.
        const byUser = new Map<string, ReturnType<typeof buildRow>>()
        function buildRow(row: (typeof memberships)[number]) {
            const ack = latestByUser.get(row.id)
            return {
                userId: row.id,
                fullName: row.fullName,
                email: row.email,
                orgs: [] as { name: string; type: string }[],
                acknowledgedVersionNumber: ack?.versionNumber ?? null,
                ackedAt: ack?.ackedAt ?? null,
            }
        }

        for (const row of memberships) {
            const existing = byUser.get(row.id) ?? buildRow(row)
            if (row.orgName && row.orgType && !existing.orgs.some((org) => org.name === row.orgName)) {
                existing.orgs.push({ name: row.orgName, type: row.orgType })
            }
            byUser.set(row.id, existing)
        }

        // Sorted here rather than in SQL because the rows were collapsed per user above. Audiences
        // are org-sized; revisit with SQL-side sort and pagination if that stops being true.
        const users = [...byUser.values()]
        const { columnAccessor = 'fullName', direction = 'asc' } = sort ?? {}
        const flip = direction === 'asc' ? 1 : -1
        users.sort((a, b) => {
            if (columnAccessor === 'ackedAt') {
                return ((a.ackedAt?.getTime() ?? 0) - (b.ackedAt?.getTime() ?? 0)) * flip
            }
            return (a[columnAccessor] ?? '').localeCompare(b[columnAccessor] ?? '') * flip
        })

        return { legalDocumentId: legalDocument?.id ?? null, users }
    })
