import { audit } from '@/server/events'
import { ENVIRONMENT_ID } from '@/server/config'
import type { AuditEventType, AuditRecordType } from '@/database/types'

/**
 * `attempted` is written before destructive work and `succeeded`/`failed` after, so a
 * run that dies partway through still leaves a record that production was touched.
 */
type QaAuditOutcome = 'attempted' | 'succeeded' | 'failed'

type QaAuditEntry = {
    /** The SI admin who invoked the route, not the account being acted on. */
    actorUserId: string
    eventType: AuditEventType
    recordType: AuditRecordType
    recordId: string
    outcome: QaAuditOutcome
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
export async function auditQaInvocation({
    actorUserId,
    eventType,
    recordType,
    recordId,
    outcome,
    metadata,
}: QaAuditEntry) {
    await audit({
        userId: actorUserId,
        eventType,
        recordType,
        recordId,
        metadata: { ...metadata, outcome, via: 'qa-api', environment: ENVIRONMENT_ID },
    })
}

/**
 * Audit a destructive QA operation so the trail survives a partial failure.
 *
 * These routes mutate several systems that cannot share a transaction (Postgres, S3,
 * Clerk). Auditing only on success means a run that commits the DB delete and then fails
 * against S3 or Clerk changes production data and leaves no record — and a retry finds
 * nothing left to describe. So an `attempted` row is written before any destructive work,
 * and a `succeeded`/`failed` row after, both carrying the same recordId.
 *
 * The attempt row is deliberately not rolled back when the operation fails: it is the
 * evidence that production was touched.
 */
export async function auditQaOperation<T>(
    entry: Omit<QaAuditEntry, 'outcome'>,
    operation: () => Promise<T>,
    /** Extra metadata for the success row, derived from the result (e.g. the deleted email). */
    successMetadata?: (result: T) => Record<string, unknown>,
): Promise<T> {
    await auditQaInvocation({ ...entry, outcome: 'attempted' })

    let result: T
    try {
        result = await operation()
    } catch (error) {
        await auditQaInvocation({
            ...entry,
            outcome: 'failed',
            metadata: { ...entry.metadata, error: error instanceof Error ? error.message : String(error) },
        })
        throw error
    }

    await auditQaInvocation({
        ...entry,
        outcome: 'succeeded',
        metadata: { ...entry.metadata, ...successMetadata?.(result) },
    })
    return result
}
