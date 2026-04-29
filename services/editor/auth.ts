// Document name parsing and Clerk-based authentication for the Hocuspocus
// editor service. Pure functions live here so they can be unit-tested
// without booting the server, opening a DB connection, or pulling Clerk
// network keys. `services/editor/server.ts` wires these into the runtime.

const REVIEW_FEEDBACK_PREFIX = 'review-feedback-'
const PROPOSAL_PREFIX = 'proposal-'
const UUID_LEN = 36
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Mirrors src/lib/collaboration-documents.ts:FIELD_TO_SLUG. Duplicated rather
// than imported because that file lives in the management-app package and the
// editor service has its own tsconfig / module-resolution setup.
const PROPOSAL_TEXT_SLUGS = ['research-questions', 'project-summary', 'impact', 'additional-notes'] as const
export type ProposalTextSlug = (typeof PROPOSAL_TEXT_SLUGS)[number]

export type ParsedDocumentName =
    | { kind: 'review-feedback'; studyId: string }
    | { kind: 'proposal-fields'; studyId: string }
    | { kind: 'proposal-text'; studyId: string; slug: ProposalTextSlug }

export function parseDocumentName(name: string): ParsedDocumentName | null {
    if (name.startsWith(REVIEW_FEEDBACK_PREFIX)) {
        const studyId = name.slice(REVIEW_FEEDBACK_PREFIX.length)
        return UUID_RE.test(studyId) ? { kind: 'review-feedback', studyId } : null
    }

    if (!name.startsWith(PROPOSAL_PREFIX)) return null
    const remainder = name.slice(PROPOSAL_PREFIX.length)
    if (remainder.length < UUID_LEN + 2) return null

    const studyId = remainder.slice(0, UUID_LEN)
    if (!UUID_RE.test(studyId)) return null
    if (remainder[UUID_LEN] !== '-') return null
    const suffix = remainder.slice(UUID_LEN + 1)

    if (suffix === 'fields') return { kind: 'proposal-fields', studyId }

    if ((PROPOSAL_TEXT_SLUGS as readonly string[]).includes(suffix)) {
        return { kind: 'proposal-text', studyId, slug: suffix as ProposalTextSlug }
    }
    return null
}

// review-feedback-* documents are owned by the reviewing org (DO).
// proposal-* documents are owned by the submitting lab.
export function requiredOrgIdForDocument(
    parsed: ParsedDocumentName,
    study: { org_id: string; submitted_by_org_id: string },
): string {
    return parsed.kind === 'review-feedback' ? study.org_id : study.submitted_by_org_id
}

export type EventType = 'proposal-submitted' | 'proposal-review-submitted'

export type StatelessSubmissionEvent = {
    type: EventType
    studyId: string
    submittedByName: string
    submittedByTabId: string
}

// Server-side validation of stateless events the client emits via
// `provider.sendStateless(...)`. Mirrors the client SubmissionEvent shape but
// stays in this package so the editor service does not import from `src/`.
export function parseStatelessEvent(payload: unknown): StatelessSubmissionEvent | null {
    if (typeof payload !== 'string') return null

    let parsed: unknown
    try {
        parsed = JSON.parse(payload)
    } catch {
        return null
    }

    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    const { type, studyId, submittedByName, submittedByTabId } = obj

    if (type !== 'proposal-submitted' && type !== 'proposal-review-submitted') return null
    if (typeof studyId !== 'string' || !UUID_RE.test(studyId)) return null
    if (typeof submittedByName !== 'string' || submittedByName.length === 0) return null
    if (typeof submittedByTabId !== 'string' || submittedByTabId.length === 0) return null

    return { type, studyId, submittedByName, submittedByTabId }
}

// Returns true when the event type is appropriate for the document kind.
// `proposal-submitted` is broadcast on the proposal-fields doc by the lab
// submitter; `proposal-review-submitted` is broadcast on the review-feedback
// doc by the DO submitter. Anything else is suspicious and dropped.
export function isStatelessEventValidForDocument(event: StatelessSubmissionEvent, parsed: ParsedDocumentName): boolean {
    if (event.studyId !== parsed.studyId) return false
    if (event.type === 'proposal-submitted') return parsed.kind === 'proposal-fields'
    if (event.type === 'proposal-review-submitted') return parsed.kind === 'review-feedback'
    return false
}

// pg.Pool-compatible query interface (small surface so tests can pass a
// hand-rolled stub without depending on `pg`).
export type DbQuery = {
    query<T>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>
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

const NA = 'Not authorized'

export async function authenticate(
    args: { token: string | null | undefined; documentName: string },
    deps: AuthenticateDeps,
): Promise<{ user: { id: string } }> {
    const { token, documentName } = args
    if (!token) throw new Error(`${NA}: missing token`)

    const payload = await deps.verifyToken(token, {
        jwtKey: deps.jwtKey,
        secretKey: deps.secretKey,
        authorizedParties: deps.authorizedParties && deps.authorizedParties.length ? deps.authorizedParties : undefined,
    })
    const clerkUserId = payload.sub
    if (!clerkUserId) throw new Error(`${NA}: token has no subject`)

    const parsed = parseDocumentName(documentName)
    if (!parsed) throw new Error(`${NA}: unrecognized document "${documentName}"`)

    const userRow = await deps.db.query<{ id: string }>('SELECT id FROM "user" WHERE clerk_id = $1', [clerkUserId])
    const internalUserId = userRow.rows[0]?.id
    if (!internalUserId) throw new Error(`${NA}: user not provisioned`)

    const studyRow = await deps.db.query<{ org_id: string; submitted_by_org_id: string }>(
        'SELECT org_id, submitted_by_org_id FROM study WHERE id = $1',
        [parsed.studyId],
    )
    const study = studyRow.rows[0]
    if (!study) throw new Error(`${NA}: study not found`)

    const requiredOrgId = requiredOrgIdForDocument(parsed, study)

    // safe-insights admin bypass OR membership in the kind-required org.
    // Status-based editing windows are enforced client-side via the kick-out
    // flow rather than here: hard-rejecting at the server would race a freshly
    // submitted user against their own redirect, and there is no UI in this
    // app that connects to a proposal-* doc post-submit.
    const accessRow = await deps.db.query(
        `SELECT 1
           FROM org_user ou
           JOIN org o ON o.id = ou.org_id
          WHERE ou.user_id = $1
            AND (
                (o.slug = $2 AND ou.is_admin = TRUE)
                OR ou.org_id = $3
            )
          LIMIT 1`,
        [internalUserId, deps.siAdminOrgSlug, requiredOrgId],
    )
    if (accessRow.rowCount === 0) throw new Error(`${NA}: no membership in study orgs`)

    return { user: { id: internalUserId } }
}
