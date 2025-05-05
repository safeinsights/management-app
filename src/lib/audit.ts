/* eslint-disable no-console */
import { db } from '@/database'
import { AuditEventType, AuditRecordType } from '@/database/types'

type AuditEntry = {
    eventType: AuditEventType
    userId: string
    recordType: AuditRecordType
    recordId: string
}

export const audit = async (entry: AuditEntry): Promise<void> => {
    console.log(`Auditing ${entry.eventType}: ${entry.recordType}/${entry.recordId}`)
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
