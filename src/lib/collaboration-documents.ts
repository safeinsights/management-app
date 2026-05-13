export type ProposalTextFieldKey = 'researchQuestions' | 'projectSummary' | 'impact' | 'additionalNotes'

const PROPOSAL_TEXT_FIELD_KEYS: ProposalTextFieldKey[] = [
    'researchQuestions',
    'projectSummary',
    'impact',
    'additionalNotes',
]

export const REVIEW_FEEDBACK_PREFIX = 'review-feedback-'
export const PROPOSAL_PREFIX = 'proposal-'
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const PROPOSAL_TEXT_SLUGS = ['research-questions', 'project-summary', 'impact', 'additional-notes'] as const
export type ProposalTextSlug = (typeof PROPOSAL_TEXT_SLUGS)[number]

const FIELD_TO_SLUG: Record<ProposalTextFieldKey, ProposalTextSlug> = {
    researchQuestions: 'research-questions',
    projectSummary: 'project-summary',
    impact: 'impact',
    additionalNotes: 'additional-notes',
}

const SLUG_TO_FIELD: Record<string, ProposalTextFieldKey> = Object.fromEntries(
    Object.entries(FIELD_TO_SLUG).map(([key, slug]) => [slug, key as ProposalTextFieldKey]),
)

export const proposalFieldsDocName = (studyId: string) => `${PROPOSAL_PREFIX}${studyId}-fields`

export const proposalTextFieldDocName = (studyId: string, fieldKey: ProposalTextFieldKey) =>
    `${PROPOSAL_PREFIX}${studyId}-${FIELD_TO_SLUG[fieldKey]}`

/**
 * Versioned review-feedback document name. A round-boundary identifier — the
 * editor for round N binds to a different Yjs document than round N-1, so a
 * stale connected client from round N-1 cannot write into round N.
 */
export const reviewFeedbackDocNameForVersion = (studyId: string, version: number) =>
    `${REVIEW_FEEDBACK_PREFIX}${studyId}-v${version}`

/**
 * Legacy unversioned name kept only for the deferred safety-net purge so a
 * partially migrated row can still be cleaned up. New call sites must use
 * `reviewFeedbackDocNameForVersion`. The auth gate rejects connections to
 * this form (see `services/editor/auth.ts`).
 */
export const reviewFeedbackLegacyDocName = (studyId: string) => `${REVIEW_FEEDBACK_PREFIX}${studyId}`

const VERSION_SUFFIX_RE = /^-v([1-9]\d*)$/

export type ParsedDocumentName =
    | { kind: 'proposal-fields'; studyId: string }
    | { kind: 'proposal-text'; studyId: string; fieldKey: ProposalTextFieldKey }
    | { kind: 'review-feedback'; studyId: string; version: number | null }

export const parseDocumentName = (name: string): ParsedDocumentName | null => {
    if (name.startsWith(REVIEW_FEEDBACK_PREFIX)) {
        const remainder = name.slice(REVIEW_FEEDBACK_PREFIX.length)
        if (remainder.length < 36) return null
        const studyId = remainder.slice(0, 36)
        if (!UUID_RE.test(studyId)) return null
        const suffix = remainder.slice(36)
        if (suffix.length === 0) return { kind: 'review-feedback', studyId, version: null }
        const m = VERSION_SUFFIX_RE.exec(suffix)
        if (!m) return null
        return { kind: 'review-feedback', studyId, version: Number(m[1]) }
    }

    if (!name.startsWith(PROPOSAL_PREFIX)) return null
    const remainder = name.slice(PROPOSAL_PREFIX.length)
    if (remainder.length < 37) return null

    const studyId = remainder.slice(0, 36)
    if (!UUID_RE.test(studyId)) return null
    if (remainder[36] !== '-') return null
    const suffix = remainder.slice(37)

    if (suffix === 'fields') return { kind: 'proposal-fields', studyId }

    const fieldKey = SLUG_TO_FIELD[suffix]
    if (!fieldKey) return null
    return { kind: 'proposal-text', studyId, fieldKey }
}

export { PROPOSAL_TEXT_FIELD_KEYS }
