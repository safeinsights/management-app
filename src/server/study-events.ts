import { sql } from 'kysely'
import type { DBExecutor } from '@/database'
import { STUDY_EVENTS_CHANNEL, type StudyChange, type StudyEvent } from '@/lib/collaboration-documents'

// Postgres refuses a NOTIFY payload of 8000 bytes or more.
const MAX_PAYLOAD_BYTES = 8000

export type StudyEventInput = Omit<StudyEvent, 'type' | 'change'> & { change: Exclude<StudyChange, 'resync'> }

export function buildStudyEvent(input: StudyEventInput): string {
    const payload = JSON.stringify({ type: 'study-changed', ...input } satisfies StudyEvent)
    const bytes = new TextEncoder().encode(payload).length
    if (bytes >= MAX_PAYLOAD_BYTES) throw new Error(`study event payload is ${bytes} bytes, over the NOTIFY limit`)
    return payload
}

// Pass the transaction that holds the write: Postgres delivers the event only when it commits.
export async function notifyStudyChanged(executor: DBExecutor, input: StudyEventInput): Promise<void> {
    await sql`select pg_notify(${STUDY_EVENTS_CHANNEL}, ${buildStudyEvent(input)})`.execute(executor)
}
