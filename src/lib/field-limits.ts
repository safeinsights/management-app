// Wording is verbatim copy from OTTER-690.
export const overCharacterLimitError = (fieldTitle: string, maxCharacters: number) =>
    `${fieldTitle} exceeds the ${maxCharacters} character limit. Shorten it to continue.`

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
