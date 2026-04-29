export type ProposalTextFieldKey = 'researchQuestions' | 'projectSummary' | 'impact' | 'additionalNotes'

const PROPOSAL_TEXT_FIELD_KEYS: ProposalTextFieldKey[] = [
    'researchQuestions',
    'projectSummary',
    'impact',
    'additionalNotes',
]

const FIELD_TO_SLUG: Record<ProposalTextFieldKey, string> = {
    researchQuestions: 'research-questions',
    projectSummary: 'project-summary',
    impact: 'impact',
    additionalNotes: 'additional-notes',
}

const SLUG_TO_FIELD: Record<string, ProposalTextFieldKey> = Object.fromEntries(
    Object.entries(FIELD_TO_SLUG).map(([key, slug]) => [slug, key as ProposalTextFieldKey]),
)

export const proposalFieldsDocName = (studyId: string) => `proposal-${studyId}-fields`

export const proposalTextFieldDocName = (studyId: string, fieldKey: ProposalTextFieldKey) =>
    `proposal-${studyId}-${FIELD_TO_SLUG[fieldKey]}`

export const reviewFeedbackDocName = (studyId: string) => `review-feedback-${studyId}`

export type ParsedDocumentName =
    | { kind: 'proposal-fields'; studyId: string }
    | { kind: 'proposal-text'; studyId: string; fieldKey: ProposalTextFieldKey }
    | { kind: 'review-feedback'; studyId: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const parseDocumentName = (name: string): ParsedDocumentName | null => {
    if (name.startsWith('review-feedback-')) {
        const studyId = name.slice('review-feedback-'.length)
        if (!UUID_RE.test(studyId)) return null
        return { kind: 'review-feedback', studyId }
    }

    if (!name.startsWith('proposal-')) return null
    const remainder = name.slice('proposal-'.length)
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
