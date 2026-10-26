// OTTER-682 (RISK-139): Trojan Source (CVE-2021-42574) and hidden-instruction characters, in every tracked file.
// TAB and a CRLF line ending are the only controls a text file needs. A lone CR hides the text before it in a
// terminal. U+2800 (Braille blank) has no invisible property but renders as a space.
const INVISIBLE = /(?!\t|\r$)[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2028\u2029\u2800]/gu

export function findInvisibleCharacters(text) {
    return text.split('\n').flatMap((line, index) =>
        Array.from(line.matchAll(INVISIBLE), (match) => ({
            line: index + 1,
            column: Array.from(line.slice(0, match.index)).length + 1,
            codePoint: `U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
        })),
    )
}
