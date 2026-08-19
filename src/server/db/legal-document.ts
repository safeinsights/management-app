import { type DBExecutor } from '@/database'
import type { OrgType } from '@/database/types'
import { type LegalDocumentTypeValue, type ParticipationAgreementType } from '@/schema/legal-document'

// tos/pn are global, so their scope columns are null rather than absent.
type DocumentScope = { type: LegalDocumentTypeValue; orgId?: string; studyId?: string }

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

// Which study column names the viewing org, and which names the org on the other side of the
// agreement. The Data Partner holds the data (study.orgId); the Research Lab submitted the study
// (study.submittedByOrgId). Both directions come from here so the party filter and the counterparty
// column can never end up pointing at the same org.
const studyAgreementSides = {
    enclave: { party: 'study.orgId', counterparty: 'study.submittedByOrgId' },
    lab: { party: 'study.submittedByOrgId', counterparty: 'study.orgId' },
} as const

/**
 * One org's study agreements, as STUDIES rather than as agreements: a study that has reached the
 * agreement stage is listed whether or not anything has been signed for it yet, so the org admin can
 * see what is outstanding.
 *
 * A lateral join rather than a join to legalDocumentVersion, because a study with several versions
 * would otherwise multiply into one row per version. It also does double duty: the same subquery
 * supplies the display fields AND answers "is there a signed agreement", which is the second half of
 * the row-set rule below.
 */
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
                            'legalDocumentVersion.id as versionId',
                            'legalDocumentVersion.filePath as filePath',
                            'legalDocumentVersion.fileName as fileName',
                            'legalDocumentVersion.format as format',
                            'legalDocumentVersion.signedAt as signedAt',
                        ])
                        .whereRef('legalDocument.studyId', '=', 'study.id')
                        .where('legalDocument.type', '=', 'SLA')
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
                'agreement.versionId',
                'agreement.filePath',
                'agreement.fileName',
                'agreement.format',
                'agreement.signedAt',
            ])
            .where('study.deletedAt', 'is', null)
            .where(party, '=', orgId)
            // Approved is the stage an agreement is drawn up at. The second arm is the durability
            // clause: once we hold a signed agreement for a study it stays on this page permanently,
            // so archiving the study cannot make an executed contract vanish from the org's records.
            .where((eb) => eb.or([eb('study.status', '=', 'APPROVED'), eb('agreement.versionId', 'is not', null)]))
            .execute()
    )
}

// The org's own participation agreement — its latest published version, or undefined when SafeInsights
// has not uploaded one yet, which is an ordinary state.
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
        .where('legalDocumentVersion.publishedAt', 'is not', null)
        .orderBy('legalDocumentVersion.versionNumber', 'desc')
        .executeTakeFirst()
