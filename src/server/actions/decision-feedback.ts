import { ActionFailure } from '@/lib/errors'
import { countCharactersFromLexical, hasLexicalContent, normalizeFeedbackToLexical } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'

// Shared by all three review steps (OTTER-737).
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
