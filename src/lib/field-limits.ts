/**
 * The one over-limit message every capped input field raises (OTTER-737).
 *
 * Lives here rather than beside any single form. The researcher proposal, both resubmission notes
 * and all three Data Partner decision fields share it, and a copy per flow could only drift.
 */
export const overCharacterLimitError = (fieldTitle: string, maxCharacters: number) =>
    `${fieldTitle} exceeds the ${maxCharacters} character limit. Shorten it to continue.`
