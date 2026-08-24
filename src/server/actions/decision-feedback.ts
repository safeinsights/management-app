import { ActionFailure } from '@/lib/errors'
import { countCharactersFromLexical, hasLexicalContent, normalizeFeedbackToLexical } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'

/**
 * The server rule behind a Data Partner's written decision, shared by all three review steps
 * (OTTER-737).
 *
 * Proposal review, code review and outputs review each ran their own copy of normalize, then
 * required, then capped. The three copies were identical apart from which constants they named,
 * and the card gives the same 1800 to all three, so a copy per action could only drift.
 *
 * Throws rather than returning an error, because every caller's next move was to throw the same
 * `ActionFailure` shape. The field title and the cap stay parameters: the two review domains keep
 * their own constants, which happen to agree today.
 */
export function assertDecisionFeedback(
    feedback: string,
    { fieldTitle, maxCharacters }: { fieldTitle: string; maxCharacters: number },
): string {
    const json = normalizeFeedbackToLexical(feedback)

    if (!hasLexicalContent(json)) {
        throw new ActionFailure({ feedback: 'Feedback is required' })
    }

    if (countCharactersFromLexical(json) > maxCharacters) {
        throw new ActionFailure({ feedback: overCharacterLimitError(fieldTitle, maxCharacters) })
    }

    return json
}
