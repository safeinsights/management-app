'use server'

import { v7 as uuidv7 } from 'uuid'
import { pathForLegalDocumentVersion } from '@/lib/paths'
import {
    createLegalDocumentDraftSchema,
    fetchLegalDocumentAcknowledgementsSchema,
    participationAgreementTypeForOrgType,
    legalDocumentFormats,
    legalDocumentScopeSchema,
    legalDocumentVersionParams,
    publishLegalDocumentVersionSchema,
} from '@/schema/legal-document'
import { storeS3File } from '../aws'
import { findLegalDocument, findOrCreateLegalDocument } from '../db/legal-document'
import { bodyForVersion, urlForLegalDocumentVersion } from '../legal-document'
import { onStudyAgreementPublished } from '../events'
import { Action, ActionFailure } from './action'
import { requiresSignedAt, scopeFromVersionId } from './legal-document-scope'

export const createLegalDocumentDraftAction = new Action('createLegalDocumentDraftAction', {
    performsMutations: true,
})
    .params(createLegalDocumentDraftSchema)
    .requireAbilityTo('create', 'LegalDocument')
    .handler(async ({ db, params: { type, orgId, studyId, file } }) => {
        const legalDocument = await findOrCreateLegalDocument(db, { type, orgId, studyId })

        if (orgId) {
            const org = await db.selectFrom('org').select('type').where('id', '=', orgId).executeTakeFirstOrThrow()
            const acceptableDocType = participationAgreementTypeForOrgType[org.type]
            if (type !== acceptableDocType)
                throw new ActionFailure({
                    orgId: `Cannot create draft of type ${type}. Participation agreement type must be ${acceptableDocType}`,
                })
        }

        // The old S3 object is left orphaned: deleting it could not roll back with the transaction.
        await db
            .deleteFrom('legalDocumentVersion')
            .where('legalDocumentId', '=', legalDocument.id)
            .where('publishedAt', 'is', null)
            .execute()

        // Generated up front so the row and the stored object agree on the key.
        const versionId = uuidv7()
        const filePath = pathForLegalDocumentVersion({ type, legalDocumentId: legalDocument.id, versionId })

        const version = await db
            .insertInto('legalDocumentVersion')
            .values({
                id: versionId,
                legalDocumentId: legalDocument.id,
                filePath,
                fileName: file.name,
                format: legalDocumentFormats[type],
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        // A failed store rolls the row back; a failed commit still orphans the object, the same
        // trade storeJobFile accepts.
        await storeS3File({ legalDocumentType: type }, file.stream(), filePath)

        return { legalDocument, version }
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
            .innerJoin('legalDocument', 'legalDocument.id', 'legalDocumentVersion.legalDocumentId')
            .selectAll('legalDocumentVersion')
            .select(['legalDocument.type as type', 'legalDocument.studyId as studyId'])
            .where('legalDocumentVersion.id', '=', versionId)
            .executeTakeFirstOrThrow()

        if (version.publishedAt) {
            throw new ActionFailure({ version: 'has already been published and cannot be republished' })
        }

        // Publish only receives a version id, so the type is unknown until the row is loaded.
        if (requiresSignedAt(version.type) && !signedAt) {
            throw new ActionFailure({ signedAt: 'is required to publish a signed agreement' })
        }
        if (!requiresSignedAt(version.type) && signedAt) {
            throw new ActionFailure({ signedAt: `does not apply to a ${version.type}` })
        }

        const { maxVersion } = await db
            .selectFrom('legalDocumentVersion')
            .select((eb) => eb.fn.max('versionNumber').as('maxVersion'))
            .where('legalDocumentId', '=', version.legalDocumentId)
            .executeTakeFirstOrThrow()

        // Makes a concurrent second publish claim zero rows and throw rather than overwrite.
        const published = await db
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

        // Only a Study Agreement has an audience to notify; the org-wide types are not acknowledged per study.
        if (version.type === 'SLA' && version.studyId) {
            onStudyAgreementPublished({ studyId: version.studyId })
        }

        return published
    })

export const fetchLegalDocumentVersionsAction = new Action('fetchLegalDocumentVersionsAction')
    .params(legalDocumentScopeSchema)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db, params: { type, orgId, studyId } }) => {
        const legalDocument = await findLegalDocument(db, { type, orgId, studyId })
        if (!legalDocument) return { legalDocumentId: null, current: null, history: [], draft: null }

        const rows = await db
            .selectFrom('legalDocumentVersion')
            .leftJoin('user', 'user.id', 'legalDocumentVersion.publishedBy')
            .select([
                'legalDocumentVersion.id',
                'legalDocumentVersion.versionNumber',
                'legalDocumentVersion.filePath',
                'legalDocumentVersion.fileName',
                'legalDocumentVersion.format',
                'legalDocumentVersion.publishedAt',
                'legalDocumentVersion.createdAt',
                'legalDocumentVersion.signedAt',
                'user.fullName as publishedByName',
            ])
            .where('legalDocumentId', '=', legalDocument.id)
            .orderBy('legalDocumentVersion.versionNumber', 'desc')
            .execute()

        const withUrls = await Promise.all(
            rows.map(async (row) => ({ ...row, downloadUrl: await urlForLegalDocumentVersion(row) })),
        )
        const published = withUrls.filter(
            (row): row is typeof row & { publishedAt: Date; versionNumber: number } => row.publishedAt !== null,
        )

        return {
            legalDocumentId: legalDocument.id,
            current: published[0] ?? null,
            history: published.slice(1),
            draft: withUrls.find((row) => row.publishedAt === null) ?? null,
        }
    })

// Read server-side: fetching the presigned S3 URL from the page needs a GET CORS rule on every bucket.
export const fetchLegalDocumentContentAction = new Action('fetchLegalDocumentContentAction')
    .params(legalDocumentVersionParams)
    .middleware(scopeFromVersionId)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db, params: { versionId } }) => {
        const version = await db
            .selectFrom('legalDocumentVersion')
            .innerJoin('legalDocument', 'legalDocument.id', 'legalDocumentVersion.legalDocumentId')
            .select(['legalDocumentVersion.filePath', 'legalDocumentVersion.fileName', 'legalDocument.type'])
            .where('legalDocumentVersion.id', '=', versionId)
            .executeTakeFirstOrThrow()

        // Through bodyForVersion so one place decides how a format maps to a body.
        const body = await bodyForVersion(version)
        if (body.format !== 'markdown') {
            throw new ActionFailure({ version: 'is not a markdown document' })
        }

        return { content: body.content }
    })

export const fetchLegalDocumentAcknowledgementsAction = new Action('fetchLegalDocumentAcknowledgementsAction')
    .params(fetchLegalDocumentAcknowledgementsSchema)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db, params: { type, orgId, studyId, sort } }) => {
        const legalDocument = await findLegalDocument(db, { type, orgId, studyId })

        // Audience is derived, not stored, so a missing row means "has not agreed".
        const memberships = await db
            .selectFrom('user')
            .leftJoin('orgUser', 'orgUser.userId', 'user.id')
            .leftJoin('org', 'org.id', 'orgUser.orgId')
            // recordId, not userId: same value for a login, but recordId is the event's subject (userId is
            // the actor, and an invite records the inviter) and it is the indexed column.
            .leftJoinLateral(
                (eb) =>
                    eb
                        .selectFrom('audit')
                        .select('audit.createdAt as lastLoginAt')
                        .whereRef('audit.recordId', '=', 'user.id')
                        .where('audit.recordType', '=', 'USER')
                        .where('audit.eventType', '=', 'LOGGED_IN')
                        .orderBy('audit.createdAt', 'desc')
                        .limit(1)
                        .as('lastLogin'),
                (join) => join.onTrue(),
            )
            .select([
                'user.id',
                'user.fullName',
                'user.email',
                'org.id as orgId',
                'org.name as orgName',
                'lastLogin.lastLoginAt',
            ])
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
                  // Without this the user's highest-numbered ack of anything wins.
                  .where('legalDocumentVersion.legalDocumentId', '=', legalDocument.id)
                  .distinctOn('legalDocumentAcknowledgement.userId')
                  .orderBy('legalDocumentAcknowledgement.userId')
                  .orderBy('legalDocumentVersion.versionNumber', 'desc')
                  .execute()
            : []

        const latestByUser = new Map(acknowledgements.map((ack) => [ack.userId, ack]))

        const byUser = new Map<string, ReturnType<typeof buildRow>>()
        function buildRow(row: (typeof memberships)[number]) {
            const ack = latestByUser.get(row.id)
            return {
                userId: row.id,
                fullName: row.fullName,
                email: row.email,
                orgs: [] as { id: string; name: string }[],
                acknowledgedVersionNumber: ack?.versionNumber ?? null,
                ackedAt: ack?.ackedAt ?? null,
                // Absent means no record, not "never signed in" — the trail starts partway through.
                lastLoginAt: row.lastLoginAt ?? null,
            }
        }

        for (const row of memberships) {
            const existing = byUser.get(row.id) ?? buildRow(row)
            // Deduped on id: org names carry no unique constraint.
            if (row.orgId && row.orgName && !existing.orgs.some((org) => org.id === row.orgId)) {
                existing.orgs.push({ id: row.orgId, name: row.orgName })
            }
            byUser.set(row.id, existing)
        }

        const users = [...byUser.values()]
        const { columnAccessor = 'fullName', direction = 'asc' } = sort ?? {}
        const flip = direction === 'asc' ? 1 : -1
        users.sort((a, b) => {
            if (columnAccessor === 'ackedAt' || columnAccessor === 'lastLoginAt') {
                // Rows with no date sort last whichever way the column is pointed.
                const left = a[columnAccessor]
                const right = b[columnAccessor]
                if (!left || !right) return Number(Boolean(right)) - Number(Boolean(left))
                return (left.getTime() - right.getTime()) * flip
            }
            return (a[columnAccessor] ?? '').localeCompare(b[columnAccessor] ?? '') * flip
        })

        return { legalDocumentId: legalDocument?.id ?? null, users }
    })
