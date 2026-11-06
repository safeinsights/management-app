'use server'

import {
    isGlobalLegalDocumentType,
    legalDocumentVersionParams,
    studyAgreementStatusSchema,
    type StudyAgreementStatus,
    type GlobalLegalDocument,
    type PendingAcknowledgement,
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

// The next group the signed-in user still owes, against the versions in force (as the SI-admin audit
// reports). Outstanding tos and pn come together; a ropa/dopa comes alone, the next arriving on the
// refetch that acknowledging triggers.
export const fetchNextPendingLegalAcknowledgementAction = new Action('fetchNextPendingLegalAcknowledgementAction')
    .middleware(globalDocumentScope)
    .requireAbilityTo('acknowledge', 'LegalDocument')
    .handler(async ({ db, session }): Promise<PendingAcknowledgement[]> => {
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
        // Separates "has been updated" from "is now available" for the modal copy.
        const acknowledgedDocumentIds = new Set(acknowledged.map((ack) => ack.legalDocumentId))
        const isUpdate = (version: { legalDocumentId: string }) => acknowledgedDocumentIds.has(version.legalDocumentId)

        // owed is ordered, so the first outstanding one decides which group to ask about.
        const outstanding = owed.filter((version) => !acknowledgedVersionIds.has(version.versionId))
        const [next] = outstanding
        if (!next) return []

        if (isGlobalLegalDocumentType(next.type)) {
            return outstanding.flatMap((version) =>
                isGlobalLegalDocumentType(version.type)
                    ? [{ type: version.type, versionId: version.versionId, isUpdate: isUpdate(version) }]
                    : [],
            )
        }

        // Only ropa/dopa carry an org. Looked up for the returned document alone.
        const orgName = next.orgId
            ? ((await db.selectFrom('org').select('name').where('id', '=', next.orgId).executeTakeFirst())?.name ??
              null)
            : null

        return [
            {
                type: next.type,
                versionId: next.versionId,
                isUpdate: isUpdate(next),
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
