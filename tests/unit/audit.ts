import { db } from '@/database'
import type { AuditRecordType } from '@/database/types'

export const getAuditEntries = (recordId: string, recordType: AuditRecordType) =>
    db
        .selectFrom('audit')
        .select(['eventType', 'recordType', 'recordId', 'userId'])
        .where('recordId', '=', recordId)
        .where('recordType', '=', recordType)
        .execute()

// Separate from getAuditEntries, whose callers use toContainEqual — exact-object matching
// would break on an extra metadata key.
export const getAuditEntriesWithMetadata = (recordId: string, recordType: AuditRecordType) =>
    db
        .selectFrom('audit')
        .select(['eventType', 'recordType', 'recordId', 'userId', 'metadata', 'createdAt'])
        .where('recordId', '=', recordId)
        .where('recordType', '=', recordType)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .execute()
