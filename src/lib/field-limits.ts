/**
 * The one over-limit message every capped input field raises (OTTER-737).
 *
 * Lives here rather than beside any single form. The researcher proposal, both resubmission notes
 * and all three Data Partner decision fields share it, and a copy per flow could only drift.
 *
 * The wording is the card's, verbatim, down to the missing "character" before "limit".
 */
export const overCharacterLimitError = (fieldTitle: string, maxCharacters: number) =>
    `${fieldTitle} exceeds the ${maxCharacters} limit. Shorten it to continue.`

/**
 * How every capped field measures its length (OTTER-737).
 *
 * Surrounding whitespace is excluded and interior whitespace is not, so "  a b  " counts 3. One
 * definition for the counter beside the field, the client rule and the server rule: measuring the
 * same value two ways is what lets a field read 1800/1800 while its validator sees 1801.
 */
export const countCharacters = (value: string) => value.trim().length
