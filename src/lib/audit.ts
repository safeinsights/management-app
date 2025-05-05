/* eslint-disable no-console */
import { db } from '@/database'
import { AuditEventType, AuditRecordType } from '@/database/types'

export const audit = async (
    eventType: AuditEventType,
    userId: string,
    recordType: AuditRecordType,
    recordId: string,
): Promise<void> => {
    console.log(`Auditing ${eventType}: ${recordType}/${recordId}`)
    await db
        .insertInto('audit')
        .values({
            userId: userId,
            eventType: eventType,
            recordType: recordType,
            recordId: recordId,
        })
        .execute()
}
