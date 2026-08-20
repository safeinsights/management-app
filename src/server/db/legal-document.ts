import { type DBExecutor } from '@/database'
import { type LegalDocumentTypeValue } from '@/schema/legal-document'

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

// With the orgs it binds. Undefined until an SI admin publishes one, the ordinary state for a
// freshly approved study.
export const latestPublishedStudyAgreement = (db: DBExecutor, studyId: string) =>
    db
        .selectFrom('legalDocument')
        .innerJoin('legalDocumentVersion', 'legalDocumentVersion.legalDocumentId', 'legalDocument.id')
        .innerJoin('study', 'study.id', 'legalDocument.studyId')
        .select([
            'legalDocumentVersion.id as versionId',
            'legalDocumentVersion.filePath as filePath',
            'legalDocumentVersion.fileName as fileName',
            'legalDocumentVersion.format as format',
            'study.orgId as dataPartnerId',
            'study.submittedByOrgId as researchLabId',
        ])
        .where('legalDocument.type', '=', 'SLA')
        .where('legalDocument.studyId', '=', studyId)
        .where('legalDocumentVersion.publishedAt', 'is not', null)
        .orderBy('legalDocumentVersion.versionNumber', 'desc')
        .limit(1)
        .executeTakeFirst()

export const hasAcknowledgedLegalDocumentVersion = async (
    db: DBExecutor,
    { versionId, userId }: { versionId: string; userId: string },
) => {
    const ack = await db
        .selectFrom('legalDocumentAcknowledgement')
        .select('id')
        .where('legalDocumentVersionId', '=', versionId)
        .where('userId', '=', userId)
        .executeTakeFirst()

    return Boolean(ack)
}
