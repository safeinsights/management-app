'use server'

import {
    isGlobalLegalDocumentType,
    legalDocumentVersionParams,
    studyAgreementStatusSchema,
    type StudyAgreementStatus,
    type GlobalLegalDocument,
    type PendingAcknowledgement,
    type PendingGlobalAcknowledgement,
} from '@/schema/legal-document'
import type { DBExecutor } from '@/database'
import type { UserSession } from '@/lib/types'
import { bodyForVersion } from '@/server/legal-document'
import { studyAgreementStatusFor } from '@/server/study-agreement'
import { Action, ActionFailure } from './action'
import { globalDocumentScope, scopeFromStudyId, scopeFromVersionId } from './legal-document-scope'
import { latestGlobalVersions, latestOwedVersions } from '@/server/db/legal-document-versions'

export const acknowledgeLegalDocumentAction = new Action('acknowledgeLegalDocumentAction', {
    performsMutations: true,
})
    .params(legalDocumentVersionParams)
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

// The versions in force (as the SI-admin audit reports) the user has not acknowledged, in owed order.
const outstandingVersions = async (db: DBExecutor, session: UserSession) => {
    const owed = await latestOwedVersions(db, session)
    if (!owed) return []

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
    // Separates "has been updated" from "is now available" for the gate copy.
    const acknowledgedDocumentIds = new Set(acknowledged.map((ack) => ack.legalDocumentId))

    return owed
        .filter((version) => !acknowledgedVersionIds.has(version.versionId))
        .map((version) => ({ ...version, isUpdate: acknowledgedDocumentIds.has(version.legalDocumentId) }))
}

const globalAcknowledgements = (outstanding: Awaited<ReturnType<typeof outstandingVersions>>) =>
    outstanding.flatMap(({ type, versionId, isUpdate }): PendingGlobalAcknowledgement[] =>
        isGlobalLegalDocumentType(type) ? [{ type, versionId, isUpdate }] : [],
    )

// The tos/pn the signed-in user still owes, which the full-page step after login asks about.
export const fetchPendingGlobalAcknowledgementsAction = new Action('fetchPendingGlobalAcknowledgementsAction')
    .middleware(globalDocumentScope)
    .requireAbilityTo('acknowledge', 'LegalDocument')
    .handler(async ({ db, session }) => globalAcknowledgements(await outstandingVersions(db, session)))

// The next group the signed-in user still owes. Outstanding tos and pn come together; a ropa/dopa
// comes alone, the next arriving on the refetch that acknowledging triggers.
export const fetchNextPendingLegalAcknowledgementAction = new Action('fetchNextPendingLegalAcknowledgementAction')
    .middleware(globalDocumentScope)
    .requireAbilityTo('acknowledge', 'LegalDocument')
    .handler(async ({ db, session }): Promise<PendingAcknowledgement[]> => {
        const outstanding = await outstandingVersions(db, session)

        // outstanding is ordered, so the first one decides which group to ask about.
        const [next] = outstanding
        if (!next) return []

        if (isGlobalLegalDocumentType(next.type)) return globalAcknowledgements(outstanding)

        // Only ropa/dopa carry an org. Looked up for the returned document alone.
        const orgName = next.orgId
            ? ((await db.selectFrom('org').select('name').where('id', '=', next.orgId).executeTakeFirst())?.name ??
              null)
            : null

        return [
            {
                type: next.type,
                versionId: next.versionId,
                isUpdate: next.isUpdate,
                orgName,
                ...(await bodyForVersion({ type: next.type, filePath: next.filePath, fileName: next.fileName })),
            },
        ]
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

// `notAParty` for anyone the agreement does not bind: an SI admin passes the ability check with
// `manage all`, but is the counterparty to every agreement and never a signatory.
export const fetchStudyAgreementStatusAction = new Action('fetchStudyAgreementStatusAction')
    .params(studyAgreementStatusSchema)
    .middleware(scopeFromStudyId)
    .requireAbilityTo('acknowledge', 'LegalDocument')
    .handler(async ({ db, params: { studyId }, session }): Promise<StudyAgreementStatus> => {
        // An unknown study reads as notAParty, so a probe learns nothing it could not guess.
        return (await studyAgreementStatusFor(db, { studyId, userId: session.user.id })) ?? { state: 'notAParty' }
    })
