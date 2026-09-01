import { type DBExecutor } from '@/database'
import type { LegalDocumentType, OrgType } from '@/database/types'
import { type ParticipationAgreementType } from '@/schema/legal-document'

// tos/pn are global, so their scope columns are null rather than absent.
type DocumentScope = { type: LegalDocumentType; orgId?: string; studyId?: string }

const documentInScope = (db: DBExecutor, { type, orgId, studyId }: DocumentScope) =>
    db
        .selectFrom('legalDocument')
        .selectAll('legalDocument')
        .where('type', '=', type)
        .where((eb) => (orgId ? eb('orgId', '=', orgId) : eb('orgId', 'is', null)))
        .where((eb) => (studyId ? eb('studyId', '=', studyId) : eb('studyId', 'is', null)))

// Undefined where the document has never been uploaded, which is an ordinary state for every scope.
export const findLegalDocument = (db: DBExecutor, scope: DocumentScope) => documentInScope(db, scope).executeTakeFirst()

// Created on first upload rather than seeded. Always returns a row: onConflict covers a concurrent
// first upload, and the loser of that race reads the winner's back, which the scope unique
// constraint guarantees is there.
export const findOrCreateLegalDocument = async (db: DBExecutor, scope: DocumentScope) => {
    const inserted = await db
        .insertInto('legalDocument')
        .values({ type: scope.type, orgId: scope.orgId ?? null, studyId: scope.studyId ?? null })
        .onConflict((oc) => oc.constraint('legal_document_scope_unique').doNothing())
        .returningAll()
        .executeTakeFirst()

    return inserted ?? (await documentInScope(db, scope).executeTakeFirstOrThrow())
}

// The Data Partner holds the data (study.orgId); the Research Lab submitted it
// (study.submittedByOrgId). Both directions come from here so they cannot point at the same org.
const studyAgreementSides = {
    enclave: { party: 'study.orgId', counterparty: 'study.submittedByOrgId' },
    lab: { party: 'study.submittedByOrgId', counterparty: 'study.orgId' },
} as const

// Lists STUDIES, not agreements: one that has reached the agreement stage appears whether or not
// anything is signed yet. Lateral rather than a join to legalDocumentVersion, which would multiply a
// study into one row per version.
export const orgStudyAgreements = (db: DBExecutor, { orgId, orgType }: { orgId: string; orgType: OrgType }) => {
    const { party, counterparty } = studyAgreementSides[orgType]

    return (
        db
            .selectFrom('study')
            .innerJoin('org as counterparty', 'counterparty.id', counterparty)
            .leftJoinLateral(
                (eb) =>
                    eb
                        .selectFrom('legalDocument')
                        .innerJoin('legalDocumentVersion', 'legalDocumentVersion.legalDocumentId', 'legalDocument.id')
                        .select([
                            'legalDocumentVersion.filePath as filePath',
                            'legalDocumentVersion.fileName as fileName',
                            'legalDocumentVersion.format as format',
                            'legalDocumentVersion.signedAt as signedAt',
                        ])
                        .whereRef('legalDocument.studyId', '=', 'study.id')
                        .where('legalDocument.type', '=', 'SLA')
                        // Redundant against the CHECK constraint, but the planner cannot infer it:
                        // without it only `type` bounds the scan of
                        // legal_document_scope_unique (type, org_id, study_id).
                        .where('legalDocument.orgId', 'is', null)
                        .where('legalDocumentVersion.publishedAt', 'is not', null)
                        .orderBy('legalDocumentVersion.versionNumber', 'desc')
                        .limit(1)
                        .as('agreement'),
                (join) => join.onTrue(),
            )
            .select([
                'study.id as studyId',
                'study.title as studyTitle',
                'counterparty.name as counterpartyName',
                'agreement.filePath',
                'agreement.fileName',
                'agreement.format',
                'agreement.signedAt',
            ])
            .where('study.deletedAt', 'is', null)
            .where(party, '=', orgId)
            // Second arm is the durability clause: once signed, a study stays listed whatever its
            // status becomes. filePath stands in for "the lateral matched", being NOT NULL.
            .where((eb) => eb.or([eb('study.status', '=', 'APPROVED'), eb('agreement.filePath', 'is not', null)]))
            .execute()
    )
}

// Latest published version, or undefined when none is uploaded yet, which is an ordinary state.
export const orgParticipationAgreement = (
    db: DBExecutor,
    { orgId, type }: { orgId: string; type: ParticipationAgreementType },
) =>
    db
        .selectFrom('legalDocument')
        .innerJoin('legalDocumentVersion', 'legalDocumentVersion.legalDocumentId', 'legalDocument.id')
        .select([
            'legalDocumentVersion.id as versionId',
            'legalDocumentVersion.filePath as filePath',
            'legalDocumentVersion.fileName as fileName',
            'legalDocumentVersion.format as format',
            'legalDocumentVersion.signedAt as signedAt',
        ])
        .where('legalDocument.type', '=', type)
        .where('legalDocument.orgId', '=', orgId)
        .where('legalDocument.studyId', 'is', null)
        .where('legalDocumentVersion.publishedAt', 'is not', null)
        .orderBy('legalDocumentVersion.versionNumber', 'desc')
        // executeTakeFirst alone fetches every published version and discards all but this one.
        .limit(1)
        .executeTakeFirst()
