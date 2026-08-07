'use server'

import { sql } from 'kysely'
import { v7 as uuidv7 } from 'uuid'
import type { DBExecutor } from '@/database'
import type { LegalDocumentType } from '@/database/types'
import { pathForLegalDocumentVersion, pathForLegalDocumentVersionFile } from '@/lib/paths'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import {
    acknowledgeLegalDocumentSchema,
    createLegalDocumentDraftSchema,
    enforcedLegalDocumentTypes,
    type EnforcedLegalDocumentType,
    fetchLegalDocumentAcknowledgementsSchema,
    fetchParticipationAgreementsSchema,
    legalDocumentFormats,
    legalDocumentScopeSchema,
    participationAgreementOrgTypes,
    publishLegalDocumentVersionSchema,
} from '@/schema/legal-document'
import { createSignedUploadUrl, signedUrlForFile } from '../aws'
import { fetchFileContents } from '../storage'
import { Action, ActionFailure } from './action'

// A signature day has no instant, so the column is a `date`. node-postgres would otherwise read it
// back as a Date at server-local midnight, which renders a day early or late once the server and
// the browser disagree about their zone.
const signedAtAsText = sql<string | null>`legal_document_version.signed_at::text`

// Only these carry an out-of-app signature; tos/pn are published, not signed.
const requiresSignedAt = (type: LegalDocumentType) => type !== 'tos' && type !== 'pn'

type DocumentScope = { type: LegalDocumentType; orgId?: string; studyId?: string }

// Gives the ability check something to match on, so a later rule can scope these to one org or
// study without touching the actions.
const scopeFromVersionId = async ({ params: { versionId }, db }: { params: { versionId: string }; db: DBExecutor }) => {
    const scope = await db
        .selectFrom('legalDocumentVersion')
        .innerJoin('legalDocument', 'legalDocument.id', 'legalDocumentVersion.legalDocumentId')
        .select(['legalDocument.orgId as orgId', 'legalDocument.studyId as studyId'])
        .where('legalDocumentVersion.id', '=', versionId)
        .executeTakeFirst()

    return { orgId: scope?.orgId ?? undefined, studyId: scope?.studyId ?? undefined }
}

// Admin-wide listings have no document to scope against. Needed because the all-optional ability
// conditions are a TS weak type: params sharing none of those properties won't compile.
const noDocumentScope = async () => ({ orgId: undefined, studyId: undefined })

// tos/pn are global, so their scope columns are null rather than absent.
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
    .handler(async ({ db, params: { type, orgId, studyId, fileName } }) => {
        // Created on first upload rather than seeded. onConflict covers a concurrent first upload.
        const legalDocument =
            (await db
                .insertInto('legalDocument')
                .values({ type, orgId: orgId ?? null, studyId: studyId ?? null })
                .onConflict((oc) => oc.constraint('legal_document_scope_unique').doNothing())
                .returningAll()
                .executeTakeFirst()) ?? (await findDocument(db, { type, orgId, studyId }))

        if (!legalDocument) throw new ActionFailure({ document: 'could not be created' })

        // A fresh upload supersedes any pending draft. The old S3 object is left orphaned — deleting
        // it here couldn't roll back with the transaction, and it's unreachable anyway.
        await db
            .deleteFrom('legalDocumentVersion')
            .where('legalDocumentId', '=', legalDocument.id)
            .where('publishedAt', 'is', null)
            .execute()

        // Generated up front so the S3 prefix and stored file_path agree without a second round-trip.
        const versionId = uuidv7()
        const pathParts = { type, legalDocumentId: legalDocument.id, versionId }

        const version = await db
            .insertInto('legalDocumentVersion')
            .values({
                id: versionId,
                legalDocumentId: legalDocument.id,
                filePath: pathForLegalDocumentVersionFile(pathParts, fileName),
                format: legalDocumentFormats[type],
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        return {
            legalDocument,
            version,
            // Takes a prefix and appends the client's filename, hence file_path built from the same one.
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
            .innerJoin('legalDocument', 'legalDocument.id', 'legalDocumentVersion.legalDocumentId')
            .selectAll('legalDocumentVersion')
            .select('legalDocument.type as type')
            .where('legalDocumentVersion.id', '=', versionId)
            .executeTakeFirstOrThrow()

        if (version.publishedAt) {
            throw new ActionFailure({ version: 'has already been published and cannot be republished' })
        }

        // Checked here rather than in the schema because publish only receives a version id, so the
        // type is not known until the row is loaded. Publishing cannot be undone, so a signed
        // agreement missing the date it was signed would be permanent.
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

        // The publishedAt guard makes a concurrent second publish claim zero rows and throw rather
        // than overwrite the first.
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
                'legalDocumentVersion.createdAt',
                'user.fullName as publishedByName',
                signedAtAsText.as('signedAt'),
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

        // Agreeing to a draft would record consent to something never shown.
        if (!version.publishedAt) {
            throw new ActionFailure({ version: 'is not published and cannot be acknowledged' })
        }

        // Re-submitting keeps the original acked_at.
        await db
            .insertInto('legalDocumentAcknowledgement')
            .values({ legalDocumentVersionId: versionId, userId: session.user.id })
            .onConflict((oc) => oc.constraint('legal_document_acknowledgement_unique').doNothing())
            .execute()

        return { acknowledged: true }
    })

type EnforcedVersion = {
    type: EnforcedLegalDocumentType
    legalDocumentId: string
    versionId: string
    filePath: string
}

const isEnforcedType = (type: LegalDocumentType): type is EnforcedLegalDocumentType =>
    (enforcedLegalDocumentTypes as readonly LegalDocumentType[]).includes(type)

// The current version of each globally-scoped document. Drafts are excluded: nobody can be obliged
// by something that was never published.
const latestEnforcedVersions = async (db: DBExecutor): Promise<EnforcedVersion[]> => {
    const rows = await db
        .selectFrom('legalDocument')
        .innerJoin('legalDocumentVersion', 'legalDocumentVersion.legalDocumentId', 'legalDocument.id')
        .select([
            'legalDocument.id as legalDocumentId',
            'legalDocument.type as type',
            'legalDocumentVersion.id as versionId',
            'legalDocumentVersion.filePath as filePath',
        ])
        .where('legalDocument.type', 'in', [...enforcedLegalDocumentTypes])
        .where('legalDocumentVersion.publishedAt', 'is not', null)
        .distinctOn('legalDocument.id')
        .orderBy('legalDocument.id')
        .orderBy('legalDocumentVersion.versionNumber', 'desc')
        .execute()

    // distinctOn dictates the ORDER BY above, so presentation order is applied after the fact.
    return rows
        .flatMap((row) => (isEnforcedType(row.type) ? [{ ...row, type: row.type }] : []))
        .sort((a, b) => enforcedLegalDocumentTypes.indexOf(a.type) - enforcedLegalDocumentTypes.indexOf(b.type))
}

const contentOf = async (filePath: string) => await (await fetchFileContents(filePath)).text()

/**
 * What the signed-in user still owes, current version only.
 *
 * A user owes a document when its latest published version has no acknowledgement row from them.
 * Superseded versions are not backfilled — the obligation is to the terms in force, which is also
 * what the SI-admin audit reports, so the two views cannot disagree.
 */
export const fetchPendingLegalAcknowledgementsAction = new Action('fetchPendingLegalAcknowledgementsAction')
    .middleware(noDocumentScope)
    .requireAbilityTo('acknowledge', 'LegalDocument')
    .handler(async ({ db, session }) => {
        const latest = await latestEnforcedVersions(db)
        if (!latest.length) return []

        const acknowledged = await db
            .selectFrom('legalDocumentAcknowledgement')
            .innerJoin(
                'legalDocumentVersion',
                'legalDocumentVersion.id',
                'legalDocumentAcknowledgement.legalDocumentVersionId',
            )
            .select(['legalDocumentVersion.legalDocumentId', 'legalDocumentVersion.id as versionId'])
            .where('legalDocumentAcknowledgement.userId', '=', session.user.id)
            .where(
                'legalDocumentVersion.legalDocumentId',
                'in',
                latest.map((version) => version.legalDocumentId),
            )
            .execute()

        const acknowledgedVersionIds = new Set(acknowledged.map((ack) => ack.versionId))
        // An earlier ack on the same document is what separates "has been updated" from "is now
        // available", so the modal can say which one happened.
        const acknowledgedDocumentIds = new Set(acknowledged.map((ack) => ack.legalDocumentId))

        const pending = latest.filter((version) => !acknowledgedVersionIds.has(version.versionId))

        // S3 is read only once something is actually outstanding. Every page load runs this action and
        // the overwhelmingly common answer is "nothing pending".
        return await Promise.all(
            pending.map(async (version) => ({
                type: version.type,
                versionId: version.versionId,
                isUpdate: acknowledgedDocumentIds.has(version.legalDocumentId),
                content: await contentOf(version.filePath),
            })),
        )
    })

/**
 * The published tos/pn, readable without a session.
 *
 * The invitation signup form renders these before an account exists, so there is nobody to
 * authorise. Safe because the response is confined to published versions of the two globally-scoped
 * public documents; nothing org- or study-scoped is reachable here.
 */
export const fetchPublicLegalDocumentsAction = new Action('fetchPublicLegalDocumentsAction').handler(async ({ db }) => {
    const latest = await latestEnforcedVersions(db)

    return await Promise.all(
        latest.map(async (version) => ({
            type: version.type,
            versionId: version.versionId,
            content: await contentOf(version.filePath),
        })),
    )
})

export const fetchLegalDocumentAcknowledgementsAction = new Action('fetchLegalDocumentAcknowledgementsAction')
    .params(fetchLegalDocumentAcknowledgementsSchema)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db, params: { type, orgId, studyId, sort } }) => {
        const legalDocument = await findDocument(db, { type, orgId, studyId })

        // Audience is derived, not stored: for tos/pn that's every user, and a missing row means
        // "has not agreed".
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
                  // Newest acknowledged version per user.
                  .distinctOn('legalDocumentAcknowledgement.userId')
                  .orderBy('legalDocumentAcknowledgement.userId')
                  .orderBy('legalDocumentVersion.versionNumber', 'desc')
                  .execute()
            : []

        const latestByUser = new Map(acknowledgements.map((ack) => [ack.userId, ack]))

        // Collapsed to one row per user, since a user can belong to several orgs.
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

        // Sorted here because the rows were collapsed above. Revisit if audiences outgrow org size.
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

// One row per agreement we hold — an org's latest published version. Orgs that have not signed are
// absent: they are reached through the picker below, not by listing every org here.
export const fetchParticipationAgreementsAction = new Action('fetchParticipationAgreementsAction')
    .params(fetchParticipationAgreementsSchema)
    .middleware(noDocumentScope)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db, params: { type } }) => {
        const rows = await db
            .selectFrom('legalDocument')
            .innerJoin('legalDocumentVersion', 'legalDocumentVersion.legalDocumentId', 'legalDocument.id')
            .innerJoin('org', 'org.id', 'legalDocument.orgId')
            .select([
                'legalDocument.id as legalDocumentId',
                'legalDocumentVersion.id as versionId',
                'legalDocumentVersion.versionNumber',
                'legalDocumentVersion.filePath',
                'legalDocumentVersion.publishedAt',
                signedAtAsText.as('signedAt'),
                'org.id as orgId',
                'org.name as orgName',
            ])
            .where('legalDocument.type', '=', type)
            .where('legalDocumentVersion.publishedAt', 'is not', null)
            .distinctOn('legalDocument.id')
            .orderBy('legalDocument.id')
            .orderBy('legalDocumentVersion.versionNumber', 'desc')
            .execute()

        // distinctOn dictates the ORDER BY above, so the display order is applied after the fact.
        rows.sort((a, b) => a.orgName.localeCompare(b.orgName))

        return await Promise.all(
            rows.map(async (row) => ({ ...row, downloadUrl: await signedUrlForFile(row.filePath) })),
        )
    })

// Drives the org picker in the upload modal. An org that has already signed stays selectable — a
// renewal is a new version of the same document, not a second one.
export const fetchParticipationSignatoriesAction = new Action('fetchParticipationSignatoriesAction')
    .params(fetchParticipationAgreementsSchema)
    .middleware(noDocumentScope)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(({ db, params: { type } }) =>
        db
            .selectFrom('org')
            .select(['org.id as orgId', 'org.name as orgName'])
            .where('org.type', '=', participationAgreementOrgTypes[type])
            // SafeInsights is the counterparty to every one of these, so it never signs one itself.
            .where('org.slug', '!=', CLERK_ADMIN_ORG_SLUG)
            .orderBy('org.name')
            .execute(),
    )

export const fetchStudyLevelAgreementsAction = new Action('fetchStudyLevelAgreementsAction')
    .middleware(noDocumentScope)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db }) => {
        const rows = await db
            .selectFrom('legalDocument')
            .innerJoin('legalDocumentVersion', 'legalDocumentVersion.legalDocumentId', 'legalDocument.id')
            .innerJoin('study', 'study.id', 'legalDocument.studyId')
            .innerJoin('org as dataPartner', 'dataPartner.id', 'study.orgId')
            .innerJoin('org as researchLab', 'researchLab.id', 'study.submittedByOrgId')
            .select([
                'legalDocument.id as legalDocumentId',
                'legalDocumentVersion.id as versionId',
                'legalDocumentVersion.versionNumber',
                'legalDocumentVersion.filePath',
                'legalDocumentVersion.publishedAt',
                signedAtAsText.as('signedAt'),
                'study.id as studyId',
                'study.title as studyTitle',
                'researchLab.name as researchLabName',
                'dataPartner.name as dataPartnerName',
            ])
            .where('legalDocument.type', '=', 'sla')
            .where('legalDocumentVersion.publishedAt', 'is not', null)
            // Newest published agreement per study; the latest is all this table shows.
            .distinctOn('legalDocument.id')
            .orderBy('legalDocument.id')
            .orderBy('legalDocumentVersion.versionNumber', 'desc')
            .execute()

        return await Promise.all(
            rows.map(async (row) => ({ ...row, downloadUrl: await signedUrlForFile(row.filePath) })),
        )
    })

export const fetchStudiesAwaitingSlaAction = new Action('fetchStudiesAwaitingSlaAction')
    .middleware(noDocumentScope)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db }) => {
        // Approved only: an SLA is drawn up after approval, so earlier studies have nothing signed.
        return await db
            .selectFrom('study')
            .innerJoin('org as dataPartner', 'dataPartner.id', 'study.orgId')
            .innerJoin('org as researchLab', 'researchLab.id', 'study.submittedByOrgId')
            .leftJoin('legalDocument', (join) =>
                join.onRef('legalDocument.studyId', '=', 'study.id').on('legalDocument.type', '=', 'sla'),
            )
            .select([
                'study.id as studyId',
                'study.title as studyTitle',
                'dataPartner.id as dataPartnerId',
                'dataPartner.name as dataPartnerName',
                'researchLab.id as researchLabId',
                'researchLab.name as researchLabName',
            ])
            .where('study.status', '=', 'APPROVED')
            .where('study.deletedAt', 'is', null)
            .where('legalDocument.id', 'is', null)
            .orderBy('dataPartner.name')
            .orderBy('researchLab.name')
            .orderBy('study.title')
            .execute()
    })
