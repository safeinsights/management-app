'use server'

import {
    legalDocumentVersionParams,
    studyAgreementStatusSchema,
    type StudyAgreementStatus,
    type GlobalLegalDocument,
    type PendingLegalDocument,
} from '@/schema/legal-document'
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
