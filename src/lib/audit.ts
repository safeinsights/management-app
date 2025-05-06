import { db } from '@/database'
import { AuditEventType, AuditRecordType } from '@/database/types'
import debug from 'debug'

const auditDebug = debug('app:audit')

type AuditEntry = {
    eventType: AuditEventType
    userId: string
    recordType: AuditRecordType
    recordId: string
}

export const audit = async (entry: AuditEntry): Promise<void> => {
    auditDebug(`Auditing ${entry.eventType}: ${entry.recordType}/${entry.recordId}`)
    await db
        .insertInto('audit')
        .values({
            userId: entry.userId,
            eventType: entry.eventType,
            recordType: entry.recordType,
            recordId: entry.recordId,
        })
        .execute()
}
