/**
 * What a `VIEWED` audit event was about. The event type is generic so that "has this researcher
 * seen X" features share one enum value; this is what tells them apart, and it lives here rather
 * than beside either the write or the read so both can reach it without a cycle.
 */
export const SUBMIT_CODE_FAQ_SUBJECT = 'SUBMIT_CODE_FAQ'
