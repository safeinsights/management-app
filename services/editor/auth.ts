// Document name parsing and Clerk-based authentication for the Hocuspocus
// editor service. Pure functions live here so they can be unit-tested
// without booting the server, opening a DB connection, or pulling Clerk
// network keys. `services/editor/server.ts` wires these into the runtime.

import {
    CODE_REVIEW_FEEDBACK_PREFIX,
    CODE_SUBMISSION_PREFIX,
    OUTPUTS_REVIEW_FEEDBACK_PREFIX,
    PROPOSAL_PREFIX,
    PROPOSAL_TEXT_SLUGS,
    RESUBMISSION_NOTE_SUFFIX_RE,
    REVIEW_FEEDBACK_PREFIX,
    STUDY_EVENTS_PREFIX,
    UUID_RE,
    type ProposalTextSlug,
} from '../../src/lib/collaboration-documents.ts'
import { ROUND_CLOSING_JOB_STATUSES, type StudyStatusValue } from '../../src/lib/job-status-rules.ts'

export type { ProposalTextSlug, StudyStatusValue as StudyStatus }

const UUID_LEN = 36

export type ParsedDocumentName =
    | { kind: 'review-feedback'; studyId: string; version: number }
    | { kind: 'code-review-feedback'; jobId: string }
    | { kind: 'outputs-review-feedback'; jobId: string }
    | { kind: 'proposal-fields'; studyId: string }
    | { kind: 'proposal-text'; studyId: string; slug: ProposalTextSlug }
    | { kind: 'proposal-resubmission-note'; studyId: string; version: number }
    | { kind: 'code-submission'; studyId: string }
    | { kind: 'study-events'; studyId: string }

const VERSION_SUFFIX_RE = /^-v([1-9]\d*)$/

// Job-keyed feedback documents: the doc name carries a study_job.id, not a study.id.
const JOB_KEYED_KINDS: ReadonlyArray<ParsedDocumentName['kind']> = ['code-review-feedback', 'outputs-review-feedback']

const isJobKeyed = (
    parsed: ParsedDocumentName,
): parsed is { kind: 'code-review-feedback' | 'outputs-review-feedback'; jobId: string } =>
    JOB_KEYED_KINDS.includes(parsed.kind)

export function parseDocumentName(name: string): ParsedDocumentName | null {
    if (name.startsWith(STUDY_EVENTS_PREFIX)) {
        const studyId = name.slice(STUDY_EVENTS_PREFIX.length)
        return UUID_RE.test(studyId) ? { kind: 'study-events', studyId } : null
    }

    if (name.startsWith(OUTPUTS_REVIEW_FEEDBACK_PREFIX)) {
        const jobId = name.slice(OUTPUTS_REVIEW_FEEDBACK_PREFIX.length)
        return UUID_RE.test(jobId) ? { kind: 'outputs-review-feedback', jobId } : null
    }

    // Longer prefix first; otherwise REVIEW_FEEDBACK_PREFIX would mis-match a
    // code-review-feedback doc name.
    if (name.startsWith(CODE_REVIEW_FEEDBACK_PREFIX)) {
        const jobId = name.slice(CODE_REVIEW_FEEDBACK_PREFIX.length)
        return UUID_RE.test(jobId) ? { kind: 'code-review-feedback', jobId } : null
    }

    if (name.startsWith(CODE_SUBMISSION_PREFIX)) {
        const studyId = name.slice(CODE_SUBMISSION_PREFIX.length)
        return UUID_RE.test(studyId) ? { kind: 'code-submission', studyId } : null
    }

    if (name.startsWith(REVIEW_FEEDBACK_PREFIX)) {
        const remainder = name.slice(REVIEW_FEEDBACK_PREFIX.length)
        if (remainder.length < UUID_LEN) return null
        const studyId = remainder.slice(0, UUID_LEN)
        if (!UUID_RE.test(studyId)) return null
        const suffix = remainder.slice(UUID_LEN)
        const m = VERSION_SUFFIX_RE.exec(suffix)
        if (!m) return null
        return { kind: 'review-feedback', studyId, version: Number(m[1]) }
    }

    if (!name.startsWith(PROPOSAL_PREFIX)) return null
    const remainder = name.slice(PROPOSAL_PREFIX.length)
    if (remainder.length < UUID_LEN + 2) return null

    const studyId = remainder.slice(0, UUID_LEN)
    if (!UUID_RE.test(studyId)) return null
    if (remainder[UUID_LEN] !== '-') return null
    const suffix = remainder.slice(UUID_LEN + 1)

    if (suffix === 'fields') return { kind: 'proposal-fields', studyId }

    const noteMatch = RESUBMISSION_NOTE_SUFFIX_RE.exec(suffix)
    if (noteMatch) return { kind: 'proposal-resubmission-note', studyId, version: Number(noteMatch[1]) }

    if ((PROPOSAL_TEXT_SLUGS as readonly string[]).includes(suffix)) {
        return { kind: 'proposal-text', studyId, slug: suffix as ProposalTextSlug }
    }
    return null
}

// review-feedback-*, code-review-feedback-* and outputs-review-feedback-* documents are owned
// by the reviewing org (DO). proposal-* documents are owned by the submitting lab.
export function requiredOrgIdForDocument(
    parsed: ParsedDocumentName,
    study: { org_id: string; submitted_by_org_id: string },
): string {
    if (parsed.kind === 'review-feedback' || isJobKeyed(parsed)) return study.org_id
    return study.submitted_by_org_id
}

export type StudyEditabilitySnapshot = {
    status: StudyStatusValue
}

// Whether the canonical Yjs state for `parsed` may still be mutated given the
// current study status. Authentication and the persist-time gate both consult
// this so stale clients cannot keep streaming updates after a status flip.
// Job-keyed review docs are not status-gated here: the management-app action layer
// is the single enforcer of code-review versioning (see
// claimInitialCodeReviewJob in code-review.actions.ts), and per-document room
// isolation in Hocuspocus prevents stale-round writes from polluting a
// different round's persisted state. Outputs-review feedback is exempt here too, but for a
// narrower reason: what bounds it is the job's files decision, not the STUDY status this snapshot
// carries, so the check lives in shouldPersistDocument where the job id is available.
export function isDocumentEditable(parsed: ParsedDocumentName, snap: StudyEditabilitySnapshot): boolean {
    switch (parsed.kind) {
        case 'review-feedback':
            return snap.status === 'PENDING-REVIEW'
        case 'proposal-fields':
        case 'proposal-text':
            return snap.status === 'DRAFT' || snap.status === 'CHANGE-REQUESTED'
        // No note exists during DRAFT — only while answering a change request.
        case 'proposal-resubmission-note':
            return snap.status === 'CHANGE-REQUESTED'
        case 'code-review-feedback':
        case 'outputs-review-feedback':
        case 'code-submission':
            // The code actions gate submission (requireResubmittableCode); code-submission only carries presence.
            return true
        // Nothing is edited there; its access rule lives in studyEventsOrgIds.
        case 'study-events':
            return true
    }
}

// The server's study change events, which clients only receive: their connections are read-only.
export const isReadOnlyDocument = (parsed: ParsedDocumentName): boolean => parsed.kind === 'study-events'

// Repeats ENCLAVE_VIEWABLE_STUDY_STATUS in src/lib/permissions.ts, which the editor image does not
// carry: an enclave member may see a study only once it is submitted. A Record, so a new status is a
// type error until someone decides it.
const ENCLAVE_SEES_STUDY_EVENTS: Record<StudyStatusValue, boolean> = {
    DRAFT: false,
    'PENDING-REVIEW': true,
    'CHANGE-REQUESTED': true,
    APPROVED: true,
    REJECTED: true,
    ARCHIVED: true,
}

// The orgs whose members may hear a study's change events, by the app's study-view rule: the lab
// always, the enclave org only for a submitted study.
export function studyEventsOrgIds(study: {
    org_id: string
    submitted_by_org_id: string
    status: StudyStatusValue
}): string[] {
    return ENCLAVE_SEES_STUDY_EVENTS[study.status] === true
        ? [study.submitted_by_org_id, study.org_id]
        : [study.submitted_by_org_id]
}

// Persist-time gate: returns true when the canonical Yjs state for this
// document is still allowed to advance. Connection-time auth (`authenticate`)
// covers new and reconnecting clients, but already-connected clients keep
// streaming Yjs updates between a status flip and their own kick-out. This
// gate is the second line of defense so post-flip writes never land in
// yjs_document.
//
// Code-review docs are exempt (see isDocumentEditable). Outputs-review docs are NOT: the decision
// action deletes the draft on submit, and without a gate here an already-connected tab would
// simply persist it again a moment later, resurrecting feedback for a decision that is final.
export async function shouldPersistDocument(parsed: ParsedDocumentName, db: Pick<DbQuery, 'query'>): Promise<boolean> {
    if (parsed.kind === 'code-review-feedback') return true
    // Nothing to persist: no Yjs content, only awareness and stateless events.
    if (parsed.kind === 'code-submission' || parsed.kind === 'study-events') return false

    if (parsed.kind === 'outputs-review-feedback') {
        return !(await hasFilesDecision(parsed.jobId, db))
    }

    const row = await db.query<{ status: StudyStatusValue }>('SELECT status FROM study WHERE id = $1', [parsed.studyId])
    const status = row.rows[0]?.status
    if (!status) return false

    return isDocumentEditable(parsed, { status })
}

// True once the job carries a terminal files decision.
export async function hasFilesDecision(jobId: string, db: Pick<DbQuery, 'query'>): Promise<boolean> {
    const decided = await db.query<{ exists: boolean }>(
        `SELECT 1 FROM job_status_change
          WHERE study_job_id = $1 AND status::text = ANY($2)
          LIMIT 1`,
        [jobId, [...ROUND_CLOSING_JOB_STATUSES]],
    )
    return decided.rowCount !== 0
}

// pg.Pool-compatible query interface (small surface so tests can pass a
// hand-rolled stub without depending on `pg`).
export type DbQuery = {
    query<T extends Record<string, unknown>>(
        text: string,
        values?: unknown[],
    ): Promise<{ rows: T[]; rowCount: number | null }>
}

export type VerifyTokenFn = (
    token: string,
    options: { jwtKey: string; secretKey?: string; authorizedParties?: string[] },
) => Promise<{ sub?: string | null }>

export interface AuthenticateDeps {
    db: DbQuery
    verifyToken: VerifyTokenFn
    jwtKey: string
    secretKey?: string
    authorizedParties?: string[]
    siAdminOrgSlug: string
}

export interface AuthenticatedContext {
    user: { id: string; clerkId: string }
    // Resolved during authenticate(). For non-code-review docs this is
    // parsed.studyId; for code-review docs it's looked up via study_job.id.
    studyId: string
}

// Resolves the authoritative studyId for the document. For study-keyed docs this is just
// parsed.studyId. For job-keyed docs (code-review / outputs-review feedback) the doc name
// carries a study_job.id, so we resolve through one single-table SELECT.
export async function studyIdForDocument(parsed: ParsedDocumentName, db: Pick<DbQuery, 'query'>): Promise<string> {
    if (!isJobKeyed(parsed)) return parsed.studyId
    const row = await db.query<{ study_id: string }>('SELECT study_id FROM study_job WHERE id = $1', [parsed.jobId])
    const studyId = row.rows[0]?.study_id
    if (!studyId) throw new AuthFailureError('STUDY_NOT_FOUND', 'study_job not found')
    return studyId
}

// Stable codes that survive serialisation to the client via
// `onAuthenticationFailed.reason`. The wire format is `CODE: message` so the
// client can split on the first colon and dispatch on `code` rather than
// pattern-matching the message text.
//
// These are *terminal* auth rejections only. INFRA_UNAVAILABLE is intentionally
// NOT a member: it travels the same `CODE: message` wire but is a recoverable
// infra failure carried by InfraUnavailableError (below), and the client treats
// it as non-terminal (retry, not "editor unavailable"). Do not fold it in here —
// making it an AuthFailureError code would latch the terminal banner (OTTER-626).
// The client's AuthFailureCode union (src/lib/realtime/auth-failure.ts) is the
// superset that lists both; keep the two in sync by hand.
export type AuthFailureCode =
    | 'MISSING_TOKEN'
    | 'INVALID_TOKEN'
    | 'UNRECOGNIZED_DOCUMENT'
    | 'USER_NOT_PROVISIONED'
    | 'STUDY_NOT_FOUND'
    | 'NO_MEMBERSHIP'
    | 'STUDY_NOT_EDITABLE'

export class AuthFailureError extends Error {
    readonly code: AuthFailureCode
    readonly reason: string
    constructor(code: AuthFailureCode, message: string) {
        // Hocuspocus forwards `err.reason` to the client (falling back to the
        // literal string "permission-denied" if absent); set both so the
        // `CODE: message` wire format survives. The client splits on the first
        // colon to recover `code`.
        const wire = `${code}: ${message}`
        super(wire)
        this.name = 'AuthFailureError'
        this.code = code
        this.reason = wire
    }
}

// Reason code for an infrastructure failure (e.g. the DB is unreachable or
// rejected our credentials) encountered while authenticating. Distinct from
// AuthFailureError so the client can show a recoverable "reconnecting" state
// instead of a terminal "editor unavailable" banner — a transient DB problem
// must not masquerade as a permanent auth denial (OTTER-626).
export const INFRA_UNAVAILABLE_CODE = 'INFRA_UNAVAILABLE'

export class InfraUnavailableError extends Error {
    readonly reason: string
    constructor(message: string) {
        const wire = `${INFRA_UNAVAILABLE_CODE}: ${message}`
        super(wire)
        this.name = 'InfraUnavailableError'
        this.reason = wire
    }
}

export async function authenticate(
    args: { token: string | null | undefined; documentName: string },
    deps: AuthenticateDeps,
): Promise<AuthenticatedContext> {
    const { token, documentName } = args
    if (!token) throw new AuthFailureError('MISSING_TOKEN', 'missing token')

    const payload = await deps.verifyToken(token, {
        jwtKey: deps.jwtKey,
        secretKey: deps.secretKey,
        authorizedParties: deps.authorizedParties && deps.authorizedParties.length ? deps.authorizedParties : undefined,
    })
    const clerkUserId = payload.sub
    if (!clerkUserId) throw new AuthFailureError('INVALID_TOKEN', 'token has no subject')

    const parsed = parseDocumentName(documentName)
    if (!parsed) throw new AuthFailureError('UNRECOGNIZED_DOCUMENT', `unrecognized document "${documentName}"`)

    const userRow = await deps.db.query<{ id: string }>('SELECT id FROM "user" WHERE clerk_id = $1', [clerkUserId])
    const internalUserId = userRow.rows[0]?.id
    if (!internalUserId) throw new AuthFailureError('USER_NOT_PROVISIONED', 'user not provisioned')

    const studyId = await studyIdForDocument(parsed, deps.db)

    const studyRow = await deps.db.query<{ org_id: string; submitted_by_org_id: string; status: StudyStatusValue }>(
        'SELECT org_id, submitted_by_org_id, status FROM study WHERE id = $1',
        [studyId],
    )
    const study = studyRow.rows[0]
    if (!study) throw new AuthFailureError('STUDY_NOT_FOUND', 'study not found')

    // The study events channel may admit either org; every other kind admits exactly one.
    const isStudyEvents = parsed.kind === 'study-events'
    const allowedOrgs = isStudyEvents ? studyEventsOrgIds(study) : requiredOrgIdForDocument(parsed, study)

    // safe-insights admin bypass OR membership in the kind-required org.
    const accessRow = await deps.db.query(
        `SELECT 1
           FROM org_user ou
           JOIN org o ON o.id = ou.org_id
          WHERE ou.user_id = $1
            AND (
                (o.slug = $2 AND ou.is_admin = TRUE)
                OR ou.org_id = ${isStudyEvents ? 'ANY($3)' : '$3'}
            )
          LIMIT 1`,
        [internalUserId, deps.siAdminOrgSlug, allowedOrgs],
    )
    if (accessRow.rowCount === 0) throw new AuthFailureError('NO_MEMBERSHIP', 'no membership in study orgs')

    // Editable-status enforcement closes the stale-tab-reconnect window for
    // proposal flows. Code-review docs are exempt: the management-app action
    // layer is the single enforcer of code-review versioning, and Hocuspocus
    // per-document room isolation prevents stale-round writes from leaking
    // into a different round's persisted state.
    if (!isDocumentEditable(parsed, { status: study.status })) {
        throw new AuthFailureError('STUDY_NOT_EDITABLE', `study is not editable (status: ${study.status})`)
    }

    return { user: { id: internalUserId, clerkId: clerkUserId }, studyId }
}
