import { type DBExecutor } from '@/database'
import { type ParticipationAgreementType } from '@/schema/legal-document'
import type { LegalDocumentType, OrgType } from '@/database/types'
import type { ExpressionBuilder, ReferenceExpression } from 'kysely'

// The scope a reader is entitled to, by document.
// - Global tos/pn (both scope columns null)
// - The ropa/dopa of the orgs passed in
// Shared by the app-wide gate and signup so the two cannot drift.
export const owedDocValidatorEb = <T>(
    eb: ExpressionBuilder<T, keyof T>,
    dbOrgRef: ReferenceExpression<T, keyof T>,
    dbStudyRef: ReferenceExpression<T, keyof T>,
    orgIds: string[],
    // TBD add study ID for SLA
) => {
    const branches = [eb.and([eb(dbOrgRef, 'is', null), eb(dbStudyRef, 'is', null)])] // TOS/PN case
    // Check for list emptiness before running any SQL,
    // since checking 'in' against an empty list is a Postgres error.
    if (orgIds.length > 0) {
        branches.push(
            eb.and([eb(dbOrgRef, 'in', orgIds), eb(dbStudyRef, 'is', null)]), // ROPA/DOPA case
        )
    }
    return eb.or(branches)
}

type DocumentScope = { type: LegalDocumentType; orgId?: string; studyId?: string }

const documentInScope = (db: DBExecutor, { type, orgId, studyId }: DocumentScope) =>
    db
        .selectFrom('legalDocument')
        .selectAll('legalDocument')
        .where('type', '=', type)
        .where((eb) => (orgId ? eb('orgId', '=', orgId) : eb('orgId', 'is', null)))
        .where((eb) => (studyId ? eb('studyId', '=', studyId) : eb('studyId', 'is', null)))

export const findLegalDocument = (db: DBExecutor, scope: DocumentScope) => documentInScope(db, scope).executeTakeFirst()

// Always returns a row: onConflict covers a concurrent first upload and the loser reads the winner's.
export const findOrCreateLegalDocument = async (db: DBExecutor, scope: DocumentScope) => {
    const inserted = await db
        .insertInto('legalDocument')
        .values({ type: scope.type, orgId: scope.orgId ?? null, studyId: scope.studyId ?? null })
        .onConflict((oc) => oc.constraint('legal_document_scope_unique').doNothing())
        .returningAll()
        .executeTakeFirst()

    return inserted ?? (await documentInScope(db, scope).executeTakeFirstOrThrow())
}

// Starts from the acknowledgement, so these read what the user signed, not what their orgs are party to.
const latestAcknowledgedVersions = (db: DBExecutor, { userId, type }: { userId: string; type: LegalDocumentType }) =>
    db
        .selectFrom('legalDocumentAcknowledgement')
        .innerJoin(
            'legalDocumentVersion',
            'legalDocumentVersion.id',
            'legalDocumentAcknowledgement.legalDocumentVersionId',
        )
        .innerJoin('legalDocument', 'legalDocument.id', 'legalDocumentVersion.legalDocumentId')
        .where('legalDocumentAcknowledgement.userId', '=', userId)
        .where('legalDocument.type', '=', type)
        .distinctOn('legalDocument.id')
        .orderBy('legalDocument.id')
        .orderBy('legalDocumentVersion.versionNumber', 'desc')

const acknowledgedVersionFields = [
    'legalDocumentVersion.filePath as filePath',
    'legalDocumentVersion.fileName as fileName',
    'legalDocumentVersion.format as format',
    'legalDocumentVersion.signedAt as signedAt',
    'legalDocumentAcknowledgement.ackedAt as ackedAt',
] as const

// Both parties, not a counterparty: no single viewing org here. Direction follows studyAgreementCounterpartyLabels.
export const userStudyAgreements = (db: DBExecutor, { userId }: { userId: string }) =>
    latestAcknowledgedVersions(db, { userId, type: 'SLA' })
        .innerJoin('study', 'study.id', 'legalDocument.studyId')
        .innerJoin('org as dataPartner', 'dataPartner.id', 'study.orgId')
        .innerJoin('org as researchLab', 'researchLab.id', 'study.submittedByOrgId')
        .select([
            'study.id as studyId',
            'study.title as studyTitle',
            'researchLab.name as fromName',
            'dataPartner.name as toName',
            ...acknowledgedVersionFields,
        ])
        .execute()

export const userParticipationAgreements = (
    db: DBExecutor,
    { userId, type }: { userId: string; type: ParticipationAgreementType },
) =>
    latestAcknowledgedVersions(db, { userId, type })
        .innerJoin('org', 'org.id', 'legalDocument.orgId')
        .select(['org.id as orgId', 'org.name as orgName', ...acknowledgedVersionFields])
        .execute()

// Both directions come from here so they cannot point at the same org.
const studyAgreementSides = {
    enclave: { party: 'study.orgId', counterparty: 'study.submittedByOrgId' },
    lab: { party: 'study.submittedByOrgId', counterparty: 'study.orgId' },
} as const

// Lists studies, not agreements. Lateral rather than a join, which would multiply a study into
// one row per version.
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
                        // Redundant against the CHECK constraint, but the planner cannot infer it,
                        // so without it only `type` bounds the index scan.
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
            // Second arm: once signed, a study stays listed whatever its status becomes.
            .where((eb) => eb.or([eb('study.status', '=', 'APPROVED'), eb('agreement.filePath', 'is not', null)]))
            .execute()
    )
}

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
        .limit(1)
        .executeTakeFirst()
