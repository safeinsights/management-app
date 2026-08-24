'use server'

import { v7 as uuidv7 } from 'uuid'
import type { DBExecutor } from '@/database'
import type { LegalDocumentType, OrgType } from '@/database/types'
import { pathForLegalDocumentVersion } from '@/lib/paths'
import { CLERK_ADMIN_ORG_SLUG, type UserSession } from '@/lib/types'
import {
    acknowledgeLegalDocumentSchema,
    createLegalDocumentDraftSchema,
    enforcedLegalDocumentTypes,
    type EnforcedLegalDocumentType,
    fetchLegalDocumentAcknowledgementsSchema,
    orgLegalParams,
    participationAgreementTypeParams,
    participationAgreementTypeForOrgType,
    legalDocumentFormats,
    type LegalDocumentFormat,
    legalDocumentScopeSchema,
    participationAgreementOrgTypes,
    publishLegalDocumentVersionSchema,
    GlobalLegalDocumentType,
    globalLegalDocumentTypes,
    type GlobalLegalDocument,
    type PendingLegalDocument,
    type LegalDocumentBody,
    type LegalDocumentTypeValue,
} from '@/schema/legal-document'
import { createSignedUploadUrlForKey, signedUrlForFile } from '../aws'
import {
    findLegalDocument,
    findOrCreateLegalDocument,
    orgParticipationAgreement,
    orgStudyAgreements,
} from '../db/legal-document'
import { orgIdFromSlug } from '../db/queries'
import { fetchFileContents } from '../storage'
import { Action, ActionFailure } from './action'

// Only these carry an out-of-app signature; tos/pn are published, not signed.
const requiresSignedAt = (type: LegalDocumentType) => type !== 'TOS' && type !== 'PN'

const legalDocumentMimeTypes: Record<LegalDocumentFormat, string> = {
    pdf: 'application/pdf',
    markdown: 'text/markdown; charset=utf-8',
}

/**
 * Every link to a stored legal document, so a version's name and type always come from the row that
 * describes it.
 *
 * Both overrides are load-bearing. The presigned POST the browser uploads with carries no
 * Content-Type, so the object sits in S3 as octet-stream, which a browser downloads whatever the
 * disposition says; and the key is the bare versionId, so without a filename the download is named
 * after a uuid with no extension.
 */
const legalDocumentDownloadUrl = ({
    filePath,
    fileName,
    format,
}: {
    filePath: string
    fileName: string
    format: string
}) =>
    signedUrlForFile(filePath, {
        ResponseContentType: legalDocumentMimeTypes[format as LegalDocumentFormat] ?? 'application/octet-stream',
        // S3 echoes this straight into the response header, and the name is whatever the admin's file
        // was called.
        ResponseContentDisposition: `inline; filename="${fileName.replace(/[\r\n]+/g, ' ').replace(/["\\]/g, '_')}"`,
    })

const isGlobalType = (type: LegalDocumentType): type is GlobalLegalDocumentType =>
    (globalLegalDocumentTypes as readonly LegalDocumentType[]).includes(type)

/**
 * Resolves who a version binds, for the ability check to match on.
 *
 * tos/pn bind everyone (isGlobal). A ropa/dopa binds its org; an sla binds both of its study's orgs
 * — the Data Partner holding the data (study.orgId) and the Research Lab that submitted it
 * (study.submittedByOrgId) — which is the same audience the upload confirmation names. An unknown
 * versionId yields no audience at all, so every condition fails closed.
 */
const scopeFromVersionId = async ({ params: { versionId }, db }: { params: { versionId: string }; db: DBExecutor }) => {
    const scope = await db
        .selectFrom('legalDocumentVersion')
        .innerJoin('legalDocument', 'legalDocument.id', 'legalDocumentVersion.legalDocumentId')
        .leftJoin('study', 'study.id', 'legalDocument.studyId')
        .select([
            'legalDocument.type as type',
            'legalDocument.orgId as orgId',
            'legalDocument.studyId as studyId',
            'study.orgId as dataPartnerId',
            'study.submittedByOrgId as researchLabId',
        ])
        .where('legalDocumentVersion.id', '=', versionId)
        .executeTakeFirst()

    return {
        orgId: scope?.orgId ?? undefined,
        studyId: scope?.studyId ?? undefined,
        // Only global tos/pn bind everyone. A ropa/dopa is enforced but binds one org
        isGlobal: scope ? isGlobalType(scope.type) : false,
        audienceOrgIds: [scope?.orgId, scope?.dataPartnerId, scope?.researchLabId].filter(
            (orgId): orgId is string => orgId != null,
        ),
    }
}

// Reads none but the globally-scoped documents, which is what the global acknowledge rule grants.
const globalDocumentScope = async () => ({ isGlobal: true, audienceOrgIds: [] })

// Admin-wide listings have no document to scope against. Needed because the all-optional ability
// conditions are a TS weak type: params sharing none of those properties won't compile.
const noDocumentScope = async () => ({ orgId: undefined, studyId: undefined })

export const createLegalDocumentDraftAction = new Action('createLegalDocumentDraftAction', {
    performsMutations: true,
})
    .params(createLegalDocumentDraftSchema)
    .requireAbilityTo('create', 'LegalDocument')
    .handler(async ({ db, params: { type, orgId, studyId, fileName } }) => {
        const legalDocument = await findOrCreateLegalDocument(db, { type, orgId, studyId })

        // A fresh upload supersedes any pending draft. The old S3 object is left orphaned — deleting
        // it here couldn't roll back with the transaction, and it's unreachable anyway.
        await db
            .deleteFrom('legalDocumentVersion')
            .where('legalDocumentId', '=', legalDocument.id)
            .where('publishedAt', 'is', null)
            .execute()

        // Generated up front so the stored file_path is the key the upload is signed for, without a
        // second round-trip.
        const versionId = uuidv7()
        const filePath = pathForLegalDocumentVersion({ type, legalDocumentId: legalDocument.id, versionId })

        const version = await db
            .insertInto('legalDocumentVersion')
            .values({
                id: versionId,
                legalDocumentId: legalDocument.id,
                filePath,
                fileName,
                format: legalDocumentFormats[type],
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        return {
            legalDocument,
            version,
            upload: await createSignedUploadUrlForKey(filePath),
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
            rows.map(async (row) => ({ ...row, downloadUrl: await legalDocumentDownloadUrl(row) })),
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

type GenericVersion = {
    type: EnforcedLegalDocumentType | GlobalLegalDocumentType
    legalDocumentId: string
    versionId: string
    filePath: string
    orgId: string | null // not null only for ropa/dopa
    studyId: string | null // not null only for sla
}

type EnforcedVersion = GenericVersion & { type: EnforcedLegalDocumentType }

export type GlobalVersion = GenericVersion & { type: GlobalLegalDocumentType }

// Current published version of each document of the given types, ordered as `types` lists them.
const latestVersionsOfTypes = async <T extends GenericVersion['type']>(
    db: DBExecutor,
    types: readonly T[],
): Promise<(GenericVersion & { type: T })[]> => {
    const rows = await db
        .selectFrom('legalDocument')
        .innerJoin('legalDocumentVersion', 'legalDocumentVersion.legalDocumentId', 'legalDocument.id')
        .select([
            'legalDocument.id as legalDocumentId',
            'legalDocument.type as type',
            'legalDocument.orgId as orgId',
            'legalDocument.studyId as studyId',
            'legalDocumentVersion.id as versionId',
            'legalDocumentVersion.filePath as filePath',
        ])
        .where('legalDocument.type', 'in', [...types])
        .where('legalDocumentVersion.publishedAt', 'is not', null)
        .distinctOn('legalDocument.id')
        .orderBy('legalDocument.id')
        .orderBy('legalDocumentVersion.versionNumber', 'desc')
        .execute()

    // Narrow DB enum to T
    const isRequestedType = (type: LegalDocumentType): type is T =>
        (types as readonly LegalDocumentType[]).includes(type)

    return rows
        .flatMap((row) => (isRequestedType(row.type) ? [{ ...row, type: row.type }] : []))
        .sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type))
}

const latestGlobalVersions = (db: DBExecutor): Promise<GlobalVersion[]> =>
    latestVersionsOfTypes(db, globalLegalDocumentTypes)

const latestOwedVersions = async (db: DBExecutor, session: UserSession): Promise<EnforcedVersion[] | null> => {
    const usersOrgIds = new Set(Object.values(session.orgs).map((org) => org.id))
    const owed = (await latestVersionsOfTypes(db, enforcedLegalDocumentTypes)).filter(
        (version) =>
            (version.orgId === null && version.studyId === null) || // TOS/PN
            (version.orgId !== null && usersOrgIds.has(version.orgId)), // ROPA/DOPA by user
    )
    if (!owed.length) return null
    return owed
}

const contentOf = async (filePath: string) => await (await fetchFileContents(filePath)).text()

// Either format == pdf & has `url`, or format == markdown and has `content`
const bodyForVersion = async (type: LegalDocumentTypeValue, filePath: string): Promise<LegalDocumentBody> =>
    legalDocumentFormats[type] === 'pdf'
        ? { format: 'pdf', url: await signedUrlForFile(filePath) } // todo: use `legalDocumentDownloadUrl` when 304 merged
        : { format: 'markdown', content: await contentOf(filePath) }

/**
 * The next thing the signed-in user still owes, current version only.
 *
 * A user owes a document when its latest published version in the user's scope has no acknowledgement row from them.
 * Global tos/pn are owed by everyone; ropa/dopa only if the user is a member of that org.
 *
 * One document rather than the whole list; the next arrives
 * on the refetch that acknowledging triggers.
 */
export const fetchNextPendingLegalAcknowledgementAction = new Action('fetchNextPendingLegalAcknowledgementAction')
    .middleware(globalDocumentScope)
    .requireAbilityTo('acknowledge', 'LegalDocument')
    .handler(async ({ db, session }): Promise<PendingLegalDocument | null> => {
        const owed = await latestOwedVersions(db, session)
        if (!owed) return null

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
                owed.map((version) => version.legalDocumentId),
            )
            .execute()

        const acknowledgedVersionIds = new Set(acknowledged.map((ack) => ack.versionId))
        // An earlier ack on the same document is what separates "has been updated" from "is now
        // available", so the modal can say which one happened.
        const acknowledgedDocumentIds = new Set(acknowledged.map((ack) => ack.legalDocumentId))

        // latestOwedVersions is ordered, so the first outstanding one is also the one to ask about.
        const next = owed.find((version) => !acknowledgedVersionIds.has(version.versionId))
        if (!next) return null

        // Only org-scoped ropa/dopa carry an org (null otherwise). Looked up for just the returned doc,
        // not joined onto every owed row.
        const orgName = next.orgId
            ? ((await db.selectFrom('org').select('name').where('id', '=', next.orgId).executeTakeFirst())?.name ??
              null)
            : null

        // Body resolved only once something is outstanding — every page load runs this, and usually
        // nothing is pending.
        return {
            type: next.type,
            versionId: next.versionId,
            isUpdate: acknowledgedDocumentIds.has(next.legalDocumentId),
            orgName,
            ...(await bodyForVersion(next.type, next.filePath)),
        }
    })

/**
 * The published tos/pn, readable without a session.
 *
 * The invitation signup form renders these before an account exists, so there is nobody to
 * authorise. Safe because the response is confined to published versions of the two globally-scoped
 * documents; nothing org- or study-scoped is reachable here.
 */
export const fetchGlobalLegalDocumentsAction = new Action('fetchGlobalLegalDocumentsAction').handler(
    async ({ db }): Promise<GlobalLegalDocument[]> => {
        const latest = await latestGlobalVersions(db)

        return await Promise.all(
            latest.map(async (version) => ({
                type: version.type,
                versionId: version.versionId,
                ...(await bodyForVersion(version.type, version.filePath)),
            })),
        )
    },
)

export const fetchLegalDocumentAcknowledgementsAction = new Action('fetchLegalDocumentAcknowledgementsAction')
    .params(fetchLegalDocumentAcknowledgementsSchema)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db, params: { type, orgId, studyId, sort } }) => {
        const legalDocument = await findLegalDocument(db, { type, orgId, studyId })

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
                  // Versions of this document only: without it the user's highest-numbered ack of
                  // anything wins, and a tos acknowledgement reports itself on the privacy notice.
                  .where('legalDocumentVersion.legalDocumentId', '=', legalDocument.id)
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
                // Never-acked users sort last whichever way the column is pointed: sorting by a date
                // asks for the rows that have one, and "has not agreed" is what the version column says.
                if (!a.ackedAt || !b.ackedAt) return Number(Boolean(b.ackedAt)) - Number(Boolean(a.ackedAt))
                return (a.ackedAt.getTime() - b.ackedAt.getTime()) * flip
            }
            return (a[columnAccessor] ?? '').localeCompare(b[columnAccessor] ?? '') * flip
        })

        return { legalDocumentId: legalDocument?.id ?? null, users }
    })

// One row per agreement we hold — an org's latest published version. Orgs that have not signed are
// absent: they are reached through the picker below, not by listing every org here.
export const fetchParticipationAgreementsAction = new Action('fetchParticipationAgreementsAction')
    .params(participationAgreementTypeParams)
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
                'legalDocumentVersion.fileName',
                'legalDocumentVersion.format',
                'legalDocumentVersion.publishedAt',
                'legalDocumentVersion.signedAt',
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
            rows.map(async (row) => ({ ...row, downloadUrl: await legalDocumentDownloadUrl(row) })),
        )
    })

// Drives the org picker in the upload modal. An org that has already signed stays selectable — a
// renewal is a new version of the same document, not a second one.
export const fetchParticipationSignatoriesAction = new Action('fetchParticipationSignatoriesAction')
    .params(participationAgreementTypeParams)
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
                'legalDocumentVersion.fileName',
                'legalDocumentVersion.format',
                'legalDocumentVersion.publishedAt',
                'legalDocumentVersion.signedAt',
                'study.id as studyId',
                'study.title as studyTitle',
                'researchLab.name as researchLabName',
                'dataPartner.name as dataPartnerName',
            ])
            .where('legalDocument.type', '=', 'SLA')
            .where('legalDocumentVersion.publishedAt', 'is not', null)
            // Newest published agreement per study; the latest is all this table shows.
            .distinctOn('legalDocument.id')
            .orderBy('legalDocument.id')
            .orderBy('legalDocumentVersion.versionNumber', 'desc')
            .execute()

        // distinctOn dictates the ORDER BY above, so the display order is applied after the fact. It
        // matches the picker's Data Partner > Research Lab > study ordering, so the table groups the
        // way the admin navigated to create the row.
        rows.sort(
            (a, b) =>
                a.dataPartnerName.localeCompare(b.dataPartnerName) ||
                a.researchLabName.localeCompare(b.researchLabName) ||
                // An untitled study sorts by the id it is displayed under.
                (a.studyTitle ?? a.studyId).localeCompare(b.studyTitle ?? b.studyId),
        )

        return await Promise.all(
            rows.map(async (row) => ({ ...row, downloadUrl: await legalDocumentDownloadUrl(row) })),
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
            // Keyed on a PUBLISHED version, not on the document row: the row is written before the
            // file is uploaded, so an abandoned upload would otherwise hide the study here while it
            // is still absent from the agreements table, leaving it unreachable from either screen.
            .where((eb) =>
                eb.not(
                    eb.exists(
                        eb
                            .selectFrom('legalDocument')
                            .innerJoin(
                                'legalDocumentVersion',
                                'legalDocumentVersion.legalDocumentId',
                                'legalDocument.id',
                            )
                            .select('legalDocument.id')
                            .whereRef('legalDocument.studyId', '=', 'study.id')
                            .where('legalDocument.type', '=', 'SLA')
                            .where('legalDocumentVersion.publishedAt', 'is not', null),
                    ),
                ),
            )
            .orderBy('dataPartner.name')
            .orderBy('researchLab.name')
            .orderBy('study.title')
            .execute()
    })

// An unsigned row carries nulls through, so the table has one shape and no sentinel value. Storage
// columns are stripped: the client needs the link, not the key it was minted from.
const withAgreementDownloadUrl = async ({
    filePath,
    fileName,
    format,
    ...rest
}: Awaited<ReturnType<typeof orgStudyAgreements>>[number]) => {
    // Null together, all three being NOT NULL. Checked rather than coerced: an empty name would
    // reach the browser as filename="".
    if (!filePath || !fileName || !format) return { ...rest, downloadUrl: null }

    return { ...rest, downloadUrl: await legalDocumentDownloadUrl({ filePath, fileName, format }) }
}

// An unknown slug leaves both ABSENT, which the `$in` rule denies — but ('manage','all') passes it,
// so an SI admin would reach the handler and index a Record with undefined. TypeScript cannot see
// it: the action builder types a middleware return as non-optional.
const requireResolvedOrg: (ctx: { orgId?: string; orgType?: OrgType }) => void = ({ orgId, orgType }) => {
    if (!orgId || !orgType) throw new ActionFailure({ org: 'was not found' })
}

// Scoped to the org in the route, so an admin of two orgs gets each org's own rows.
export const fetchOrgStudyAgreementsAction = new Action('fetchOrgStudyAgreementsAction')
    .params(orgLegalParams)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'OrgLegalDocuments')
    // Unordered on purpose: the table sorts from its first paint, so ordering here would be a
    // second copy of the same rule.
    .handler(async ({ db, orgId, orgType }) => {
        requireResolvedOrg({ orgId, orgType })

        const rows = await orgStudyAgreements(db, { orgId, orgType })

        return await Promise.all(rows.map(withAgreementDownloadUrl))
    })

// The type comes from the org's own record, never the caller, so a lab admin cannot ask for a DOPA.
export const fetchOrgParticipationAgreementAction = new Action('fetchOrgParticipationAgreementAction')
    .params(orgLegalParams)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'OrgLegalDocuments')
    .handler(async ({ db, orgId, orgType }) => {
        requireResolvedOrg({ orgId, orgType })

        const type = participationAgreementTypeForOrgType[orgType]
        const agreement = await orgParticipationAgreement(db, { orgId, type })

        if (!agreement) return { type, agreement: null }

        return {
            type,
            agreement: {
                signedAt: agreement.signedAt,
                downloadUrl: await legalDocumentDownloadUrl(agreement),
            },
        }
    })
