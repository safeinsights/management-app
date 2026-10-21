import { db } from '@/database'
import { writeStudyAgreementVersion } from '@/server/db/legal-document'

// Legal documents are global singletons, so version counts assert on database-wide state.
// Keep the delete order, or the foreign keys refuse and concurrent suites deadlock.
export const resetLegalDocuments = async () => {
    await db.deleteFrom('legalDocumentAcknowledgement').execute()
    await db.deleteFrom('legalDocumentVersion').execute()
    await db.deleteFrom('legalDocument').execute()
}

type InsertTestStudyAgreementOptions = {
    studyId: string
    versionNumber?: number
    /** Unpublished versions are drafts, which oblige nobody. */
    published?: boolean
}

// Written directly, not through the admin action, which would replace the session mid-fixture.
export const insertTestStudyAgreement = async ({
    studyId,
    versionNumber = 1,
    published = true,
}: InsertTestStudyAgreementOptions) => {
    const { researcherId } = await db
        .selectFrom('study')
        .select('researcherId')
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow()

    return await writeStudyAgreementVersion(db, {
        studyId,
        publishedBy: researcherId,
        signedAt: '2026-01-01',
        versionNumber,
        published,
    })
}

// A real agreement plus its acknowledgements, rather than marking fixtures test studies: otherwise
// the default fixture is the one that bypasses the gate. Callable again after a test mints another
// session user, since the unique constraint absorbs the acks already written.
export const seedAcknowledgedStudyAgreement = async (studyId: string) => {
    const study = await db
        .selectFrom('study')
        .leftJoin('legalDocument', (join) =>
            join.onRef('legalDocument.studyId', '=', 'study.id').on('legalDocument.type', '=', 'SLA'),
        )
        .leftJoin('legalDocumentVersion', 'legalDocumentVersion.legalDocumentId', 'legalDocument.id')
        .select([
            'study.orgId as dataPartnerId',
            'study.submittedByOrgId as researchLabId',
            'legalDocumentVersion.id as versionId',
        ])
        .where('study.id', '=', studyId)
        .orderBy('legalDocumentVersion.versionNumber', (ob) => ob.desc().nullsLast())
        .executeTakeFirst()
    if (!study) throw new Error(`seedAcknowledgedStudyAgreement: no study ${studyId}`)

    // Reuses the study's agreement when it already has one, so a test that mints a second session
    // user can call this again to acknowledge on their behalf.
    const versionId = study.versionId ?? (await insertTestStudyAgreement({ studyId })).id

    const parties = await db
        .selectFrom('orgUser')
        .select('userId')
        .distinct()
        .where('orgId', 'in', [study.dataPartnerId, study.researchLabId])
        .execute()

    if (!parties.length) return

    await db
        .insertInto('legalDocumentAcknowledgement')
        .values(parties.map(({ userId }) => ({ legalDocumentVersionId: versionId, userId })))
        .onConflict((oc) => oc.constraint('legal_document_acknowledgement_unique').doNothing())
        .execute()
}
