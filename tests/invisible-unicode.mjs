// OTTER-682 (RISK-139): Trojan Source (CVE-2021-42574) and hidden-instruction characters, in every tracked file.
// Keep this file and bin/check-invisible-unicode.mjs in step with their copies in iac scripts/. Names need no
// control character. U+2800 (Braille blank) has no invisible property but renders as a space.
const INVISIBLE_IN_NAME = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2028\u2029\u2800]/gu
// TAB and a CRLF line ending are the only controls a text file needs. A lone CR hides the text before it in a
// terminal.
const INVISIBLE = new RegExp(`(?!\\t|\\r$)${INVISIBLE_IN_NAME.source}`, 'gu')

const toCodePoint = (char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`

export function findInvisibleCharacters(text) {
    return text.split('\n').flatMap((line, index) =>
        Array.from(line.matchAll(INVISIBLE), (match) => ({
            line: index + 1,
            column: Array.from(line.slice(0, match.index)).length + 1,
            codePoint: toCodePoint(match[0]),
        })),
    )
}

export function findInvisibleInName(name) {
    return Array.from(name.matchAll(INVISIBLE_IN_NAME), (match) => toCodePoint(match[0]))
}
