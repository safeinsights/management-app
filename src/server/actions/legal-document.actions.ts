'use server'

import { v7 as uuidv7 } from 'uuid'
import type { DBExecutor } from '@/database'
import type { LegalDocumentFormat, LegalDocumentType, OrgType } from '@/database/types'
import { pathForLegalDocumentVersion } from '@/lib/paths'
import { CLERK_ADMIN_ORG_SLUG, type UserSession } from '@/lib/types'
import {
    acknowledgeLegalDocumentSchema,
    createLegalDocumentDraftSchema,
    enforcedLegalDocumentTypes,
    type EnforcedLegalDocumentType,
    fetchLegalDocumentAcknowledgementsSchema,
    orgLegalParams,
    orgStudyAgreementParams,
    participationAgreementTypeParams,
    userParticipationAgreementParams,
    userStudyAgreementParams,
    participationAgreementTypeForOrgType,
    legalDocumentFormats,
    legalDocumentScopeSchema,
    participationAgreementOrgTypes,
    publishLegalDocumentVersionSchema,
    globalDocumentTypeParams,
    inviteParams,
    GlobalLegalDocumentType,
    globalLegalDocumentTypes,
    type GlobalLegalDocument,
    type PendingLegalDocument,
    type ResolvedLegalDocument,
    type LegalDocumentBody,
} from '@/schema/legal-document'
import { createSignedUploadUrlForKey, signedUrlForFile } from '../aws'
import {
    findLegalDocument,
    findOrCreateLegalDocument,
    orgParticipationAgreement,
    orgStudyAgreements,
    userParticipationAgreements,
    userStudyAgreements,
    owedDocValidatorEb,
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

// Both overrides are load-bearing: the presigned POST leaves the object as octet-stream, and
// the key is a bare versionId so the download would be named after a uuid with no extension.
const legalDocumentDownloadUrl = ({
    filePath,
    fileName,
    format,
}: {
    filePath: string
    fileName: string
    format: LegalDocumentFormat
}) =>
    signedUrlForFile(filePath, {
        ResponseContentType: legalDocumentMimeTypes[format],
        // S3 echoes this into the response header verbatim.
        ResponseContentDisposition: `inline; filename="${fileName.replace(/[\r\n]+/g, ' ').replace(/["\\]/g, '_')}"`,
    })

const isGlobalType = (type: LegalDocumentType): type is GlobalLegalDocumentType =>
    (globalLegalDocumentTypes as readonly LegalDocumentType[]).includes(type)

// An unknown versionId yields no audience, so every condition fails closed.
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

const globalDocumentScope = async () => ({ isGlobal: true, audienceOrgIds: [] })

// Needed because the all-optional ability conditions are a TS weak type.
const noDocumentScope = async () => ({ orgId: undefined, studyId: undefined })

export const createLegalDocumentDraftAction = new Action('createLegalDocumentDraftAction', {
    performsMutations: true,
})
    .params(createLegalDocumentDraftSchema)
    .requireAbilityTo('create', 'LegalDocument')
    .handler(async ({ db, params: { type, orgId, studyId, fileName } }) => {
        const legalDocument = await findOrCreateLegalDocument(db, { type, orgId, studyId })

        // For participation agreements: Make sure agreement type matches org's type
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

        // Generated up front so the stored file_path is the key the upload is signed for.
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

        if (!version.publishedAt) {
            throw new ActionFailure({ version: 'is not published and cannot be acknowledged' })
        }

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
    fileName: string // names the download; a pdf key is a bare uuid without it
    orgId: string | null // not null only for ropa/dopa
    studyId: string | null // not null only for sla
    publishedAt: Date | null // tos/pn carry no signed_at, so this is their only effective date
}

type EnforcedVersion = GenericVersion & { type: EnforcedLegalDocumentType }

export type GlobalVersion = GenericVersion & { type: GlobalLegalDocumentType }

// Current published version of each document of the given types, ordered as `types` lists them.
const latestVersionsOfTypes = async <T extends GenericVersion['type']>(
    db: DBExecutor,
    types: readonly T[],
    orgIds: string[],
    // TBD: include study IDs for SLA case
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
            'legalDocumentVersion.fileName as fileName',
            'legalDocumentVersion.publishedAt as publishedAt',
        ])
        .where('legalDocument.type', 'in', [...types])
        .where('legalDocumentVersion.publishedAt', 'is not', null)
        // filter by relevant orgs - tbd add studyIds
        .where((eb) => owedDocValidatorEb(eb, 'legalDocument.orgId', 'legalDocument.studyId', orgIds))
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
    latestVersionsOfTypes(db, globalLegalDocumentTypes, [])

const latestOwedVersions = async (db: DBExecutor, session: UserSession): Promise<EnforcedVersion[] | null> => {
    const usersOrgIds = Object.values(session.orgs).map((org) => org.id)
    const owed = await latestVersionsOfTypes(db, enforcedLegalDocumentTypes, usersOrgIds)
    if (!owed.length) return null
    return owed
}

const contentOf = async (filePath: string) => await (await fetchFileContents(filePath)).text()

// A pdf gets a signed url, markdown gets inlined content. fileName only rides the pdf branch, where
// it names the download (the S3 key is a bare uuid).
const bodyForVersion = async ({
    type,
    filePath,
    fileName,
}: {
    type: LegalDocumentType
    filePath: string
    fileName: string
}): Promise<LegalDocumentBody> =>
    legalDocumentFormats[type] === 'pdf'
        ? { format: 'pdf', url: await legalDocumentDownloadUrl({ filePath, fileName, format: 'pdf' }) }
        : { format: 'markdown', content: await contentOf(filePath) }

// The next document the signed-in user still owes. Superseded versions are not backfilled: the
// obligation is to the terms in force, matching what the SI-admin audit reports. One at a time, the
// next arriving on the refetch that acknowledging triggers.
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
        // Separates "has been updated" from "is now available" for the modal copy.
        const acknowledgedDocumentIds = new Set(acknowledged.map((ack) => ack.legalDocumentId))

        // owed is ordered, so the first outstanding one is also the one to ask about.
        const next = owed.find((version) => !acknowledgedVersionIds.has(version.versionId))
        if (!next) return null

        // Only ropa/dopa carry an org. Looked up for the returned document alone, not joined onto
        // every owed row.
        const orgName = next.orgId
            ? ((await db.selectFrom('org').select('name').where('id', '=', next.orgId).executeTakeFirst())?.name ??
              null)
            : null

        return {
            type: next.type,
            versionId: next.versionId,
            isUpdate: acknowledgedDocumentIds.has(next.legalDocumentId),
            orgName,
            ...(await bodyForVersion({ type: next.type, filePath: next.filePath, fileName: next.fileName })),
        }
    })

// Readable without a session: the invitation signup form renders these before an account exists.
// Confined to published versions of the two globally-scoped documents.
export const fetchGlobalLegalDocumentsAction = new Action('fetchGlobalLegalDocumentsAction').handler(
    async ({ db }): Promise<GlobalLegalDocument[]> => {
        const latest = await latestGlobalVersions(db)

        return await Promise.all(
            latest.map(async (version) => ({
                type: version.type,
                versionId: version.versionId,
                ...(await bodyForVersion({
                    type: version.type,
                    filePath: version.filePath,
                    fileName: version.fileName,
                })),
            })),
        )
    },
)

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

        rows.sort((a, b) => a.orgName.localeCompare(b.orgName))

        return await Promise.all(
            rows.map(async (row) => ({ ...row, downloadUrl: await legalDocumentDownloadUrl(row) })),
        )
    })

// An org that has already signed stays selectable: a renewal is a new version of the same document.
export const fetchParticipationSignatoriesAction = new Action('fetchParticipationSignatoriesAction')
    .params(participationAgreementTypeParams)
    .middleware(noDocumentScope)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(({ db, params: { type } }) =>
        db
            .selectFrom('org')
            .select(['org.id as orgId', 'org.name as orgName'])
            .where('org.type', '=', participationAgreementOrgTypes[type])
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
            .distinctOn('legalDocument.id')
            .orderBy('legalDocument.id')
            .orderBy('legalDocumentVersion.versionNumber', 'desc')
            .execute()

        // distinctOn dictates the ORDER BY above, so display order is applied after the fact.
        rows.sort(
            (a, b) =>
                a.dataPartnerName.localeCompare(b.dataPartnerName) ||
                a.researchLabName.localeCompare(b.researchLabName) ||
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
            // Keyed on a PUBLISHED version, not the document row: that row is written before the
            // file is uploaded, so an abandoned upload would hide the study from both screens.
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

// Strips the file columns as it goes, so a presigned url reaches the client and the S3 key does not.
const withPdfUrl = async <T extends { filePath: string; fileName: string; format: LegalDocumentFormat }>({
    filePath,
    fileName,
    format,
    ...rest
}: T) => ({ ...rest, downloadUrl: await legalDocumentDownloadUrl({ filePath, fileName, format }) })

// An unknown slug leaves orgId undefined; ('manage','all') passes the $in rule, so an SI admin
// would reach the handler and index a Record with undefined. TypeScript cannot see it.
function requireResolvedOrg(ctx: {
    orgId?: string
    orgType?: OrgType
}): asserts ctx is { orgId: string; orgType: OrgType } {
    if (!ctx.orgId || !ctx.orgType) throw new ActionFailure({ org: 'was not found' })
}

export const fetchOrgStudyAgreementsAction = new Action('fetchOrgStudyAgreementsAction')
    .params(orgStudyAgreementParams)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'OrgLegalDocuments')
    .handler(async ({ db, orgId, orgType, params: { sort } }) => {
        requireResolvedOrg({ orgId, orgType })

        const rows = await orgStudyAgreements(db, { orgId, orgType, sort })

        // An unsigned row carries nulls through, so the table has one shape and no sentinel. All
        // three are null together; an empty name would reach the browser as filename="".
        return await Promise.all(
            rows.map(async ({ filePath, fileName, format, ...rest }) =>
                filePath && fileName && format
                    ? await withPdfUrl({ ...rest, filePath, fileName, format })
                    : { ...rest, downloadUrl: null },
            ),
        )
    })

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

export const fetchUserStudyAgreementsAction = new Action('fetchUserStudyAgreementsAction')
    .params(userStudyAgreementParams)
    .requireAbilityTo('view', 'UserLegalDocuments')
    .handler(async ({ db, session, params: { sort } }) => {
        const rows = await userStudyAgreements(db, { userId: session.user.id, sort })

        return await Promise.all(rows.map(withPdfUrl))
    })

export const fetchUserParticipationAgreementsAction = new Action('fetchUserParticipationAgreementsAction')
    .params(userParticipationAgreementParams)
    .requireAbilityTo('view', 'UserLegalDocuments')
    .handler(async ({ db, session, params: { type, sort } }) => {
        const rows = await userParticipationAgreements(db, { userId: session.user.id, type, sort })

        return await Promise.all(rows.map(withPdfUrl))
    })

// The terms in force, not the version the user acked. Those coincide whenever the login gate has
// done its job; ackedAt is looked up separately so it reads null for a user who reached the page
// still owing this version.
export const fetchUserGlobalDocumentAction = new Action('fetchUserGlobalDocumentAction')
    .params(globalDocumentTypeParams)
    .requireAbilityTo('view', 'UserLegalDocuments')
    .handler(
        async ({
            db,
            session,
            params: { type },
        }): Promise<(ResolvedLegalDocument & { publishedAt: Date | null; ackedAt: Date | null }) | null> => {
            const [version] = await latestVersionsOfTypes(db, [type], [])
            if (!version) return null

            const ack = await db
                .selectFrom('legalDocumentAcknowledgement')
                .select('ackedAt')
                .where('legalDocumentVersionId', '=', version.versionId)
                .where('userId', '=', session.user.id)
                .executeTakeFirst()

            return {
                type,
                versionId: version.versionId,
                publishedAt: version.publishedAt,
                ackedAt: ack?.ackedAt ?? null,
                ...(await bodyForVersion(version)),
            }
        },
    )

export type ParticipationData = {
    versionId: string
    type: 'ROPA' | 'DOPA'
    url: string
}

/**
 * The published ropa/dopa the invite's org owes, or null when none is published yet.
 *
 * Read by the invitation signup form, so null (an ordinary state) stands for "nothing to show or
 * agree to" rather than a sentinel row the caller has to decode.
 */
export const fetchParticipationAgreementFromInviteIdAction = new Action('fetchParticipationAgreementFromInviteIdAction')
    .params(inviteParams)
    // Unauthenticated by necessity: the signup form has only the invite id. That makes an
    // unclaimed invite id a bearer token for this org's executed agreement, and invites
    // have no TTL - revoking means deleting the row.
    .handler(async ({ db, params: { inviteId } }): Promise<ParticipationData | null> => {
        const inviteOrgDetails: { inviteId: string; type: 'enclave' | 'lab'; orgId: string } | undefined = await db
            .selectFrom('pendingUser')
            .innerJoin('org', 'org.id', 'pendingUser.orgId')
            .select(['pendingUser.id as inviteId', 'org.type', 'org.id as orgId'])
            .where('pendingUser.id', '=', inviteId)
            .where('pendingUser.claimedByUserId', 'is', null)
            .executeTakeFirst()

        if (!inviteOrgDetails) return null

        const doctype = participationAgreementTypeForOrgType[inviteOrgDetails.type]

        const agreement = await orgParticipationAgreement(db, { orgId: inviteOrgDetails.orgId, type: doctype })
        if (!agreement) return null

        const body = await bodyForVersion({ type: doctype, filePath: agreement.filePath, fileName: agreement.fileName })
        // `legalDocumentFormats` fixes ropa/dopa as pdf, so this narrowing cannot fail.
        if (body.format !== 'pdf') throw new Error('participation agreement is not a pdf')

        return {
            versionId: agreement.versionId,
            type: doctype,
            url: body.url,
        }
    })
