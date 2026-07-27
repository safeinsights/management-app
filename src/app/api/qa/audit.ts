import { audit } from '@/server/events'
import { ENVIRONMENT_ID } from '@/server/config'
import type { AuditEventType, AuditRecordType } from '@/database/types'

type QaAuditEntry = {
    /** The SI admin who invoked the route, not the account being acted on. */
    actorUserId: string
    eventType: AuditEventType
    recordType: AuditRecordType
    recordId: string
    metadata?: Record<string, unknown>
}

/**
 * Record a QA route invocation. These routes run against production data, so every
 * call is written to the audit trail attributed to the SI admin who made it, tagged
 * with `via: 'qa-api'` so QA activity can be told apart from ordinary app mutations.
 *
 * Awaited rather than deferred: the audit row is the record that this happened, so it
 * must be durable before the response goes out.
 */
export async function auditQaInvocation({ actorUserId, eventType, recordType, recordId, metadata }: QaAuditEntry) {
    await audit({
        userId: actorUserId,
        eventType,
        recordType,
        recordId,
        metadata: { ...metadata, via: 'qa-api', environment: ENVIRONMENT_ID },
    })
}
