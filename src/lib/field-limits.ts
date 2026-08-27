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

// Grapheme clusters, not `.length`. `.length` is UTF-16 code units, which charges the user for
// storage rather than for what they typed: an NFD-composed "é" (the form Word emits) costs 2 and a
// family emoji costs 11. Nobody would notice on an 1800-character body, but the study title has 60,
// where a researcher could watch the counter pass the cap on a title of 40 visible letters with
// nothing on screen to explain it. Segmenting also settles the NFC/NFD question on its own, since
// either encoding of "é" is one cluster, so no normalize pass is needed ahead of it.
//
// Built once at module scope: constructing a Segmenter costs more than the segmenting does, and
// both the counter and the rule that gates the field run on every keystroke.
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

// Plain ASCII has one grapheme per code unit, so `.length` is already the right answer for it and
// the segmenter can be skipped. CR is excluded because "\r\n" is the one ASCII pair that UAX #29
// joins into a single cluster, which is where the shortcut would otherwise disagree with the
// segmenter. Worth the test: a full 6000-character project summary measures ~0.27ms segmented
// against ~0.002ms here, on a path that runs per keystroke.
const SINGLE_UNIT_ASCII = /^[\n\t\x20-\x7E]*$/

/**
 * How every capped field measures its length (OTTER-737).
 *
 * Surrounding whitespace is excluded and interior whitespace is not, so "  a b  " counts 3. One
 * definition for the counter beside the field, the client rule and the server rule: measuring the
 * same value two ways is what lets a field read 1800/1800 while its validator sees 1801.
 */
export const countCharacters = (value: string) => {
    const trimmed = value.trim()
    if (SINGLE_UNIT_ASCII.test(trimmed)) return trimmed.length

    return Array.from(graphemes.segment(trimmed)).length
}
