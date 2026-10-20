import type { DBExecutor } from '@/database'
import type { LegalDocumentType } from '@/database/types'
import { type UserSession } from '@/lib/types'
import {
    enforcedLegalDocumentTypes,
    type EnforcedLegalDocumentType,
    GlobalLegalDocumentType,
    globalLegalDocumentTypes,
} from '@/schema/legal-document'
import { owedDocValidatorEb } from './legal-document'

export type GenericVersion = {
    type: EnforcedLegalDocumentType | GlobalLegalDocumentType
    legalDocumentId: string
    versionId: string
    filePath: string
    fileName: string // names the download; a pdf key is a bare uuid without it
    orgId: string | null // not null only for ropa/dopa
    studyId: string | null // not null only for sla
    publishedAt: Date | null // tos/pn carry no signed_at, so this is their only effective date
}

export type EnforcedVersion = GenericVersion & { type: EnforcedLegalDocumentType }

export type GlobalVersion = GenericVersion & { type: GlobalLegalDocumentType }

// Current published version of each document of the given types, ordered as `types` lists them.
export const latestVersionsOfTypes = async <T extends GenericVersion['type']>(
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

    const isRequestedType = (type: LegalDocumentType): type is T =>
        (types as readonly LegalDocumentType[]).includes(type)

    return rows
        .flatMap((row) => (isRequestedType(row.type) ? [{ ...row, type: row.type }] : []))
        .sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type))
}

export const latestGlobalVersions = (db: DBExecutor): Promise<GlobalVersion[]> =>
    latestVersionsOfTypes(db, globalLegalDocumentTypes, [])

export const latestOwedVersions = async (db: DBExecutor, session: UserSession): Promise<EnforcedVersion[] | null> => {
    const usersOrgIds = Object.values(session.orgs).map((org) => org.id)
    const owed = await latestVersionsOfTypes(db, enforcedLegalDocumentTypes, usersOrgIds)
    if (!owed.length) return null
    return owed
}
