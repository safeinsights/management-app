import type { DBExecutor } from '@/database'
import type { LegalDocumentType } from '@/database/types'
import { GlobalLegalDocumentType, globalLegalDocumentTypes } from '@/schema/legal-document'

// Only these carry an out-of-app signature; tos/pn are published, not signed.
export const requiresSignedAt = (type: LegalDocumentType) => type !== 'TOS' && type !== 'PN'

export const isGlobalType = (type: LegalDocumentType): type is GlobalLegalDocumentType =>
    (globalLegalDocumentTypes as readonly LegalDocumentType[]).includes(type)

// An unknown versionId yields no audience, so every condition fails closed.
export const scopeFromVersionId = async ({
    params: { versionId },
    db,
}: {
    params: { versionId: string }
    db: DBExecutor
}) => {
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

// As scopeFromVersionId, for a caller holding a study rather than a version.
export const scopeFromStudyId = async ({
    params: { studyId },
    db,
}: {
    params: { studyId: string }
    db: DBExecutor
}) => {
    const study = await db
        .selectFrom('study')
        .select(['orgId as dataPartnerId', 'submittedByOrgId as researchLabId'])
        .where('id', '=', studyId)
        .executeTakeFirst()

    return {
        studyId,
        isGlobal: false,
        audienceOrgIds: study ? [study.dataPartnerId, study.researchLabId] : [],
    }
}

export const globalDocumentScope = async () => ({ isGlobal: true, audienceOrgIds: [] })

// Needed because the all-optional ability conditions are a TS weak type.
export const noDocumentScope = async () => ({ orgId: undefined, studyId: undefined })
