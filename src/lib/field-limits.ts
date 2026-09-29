// Wording is verbatim copy from OTTER-690.
export const overCharacterLimitError = (fieldTitle: string, maxCharacters: number) =>
    `${fieldTitle} exceeds the ${maxCharacters} character limit. Shorten it to continue.`

// Derived, never stored: setFieldValue clears the field's error and Mantine dedupes the
// setFieldError that would put it back (OTTER-777). The required half stays with blur and submit.
export const liveLimitError = (isOverLimit: boolean, overLimitError: string, storedError: unknown) =>
    isOverLimit ? overLimitError : (storedError as string | undefined)

// Grapheme clusters, not `.length`: code units charge for storage rather than for what the user
// typed. Built once because the counter runs per keystroke.
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

// Plain ASCII is one grapheme per code unit, so the segmenter can be skipped. CR is excluded
// because "\r\n" is the one ASCII pair UAX #29 joins into a single cluster.
const SINGLE_UNIT_ASCII = /^[\n\t\x20-\x7E]*$/

// One definition shared by the field counter, the client rule and the server rule, so a field
// cannot read 1800/1800 while its validator sees 1801 (OTTER-737).
export const countCharacters = (value: string) => {
    const trimmed = value.trim()
    if (SINGLE_UNIT_ASCII.test(trimmed)) return trimmed.length

    return Array.from(graphemes.segment(trimmed)).length
}
