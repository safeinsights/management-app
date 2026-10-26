// OTTER-682 (RISK-139): Trojan Source (CVE-2021-42574) and hidden-instruction characters, in every tracked file.
// TAB, LF and CR are the only controls a text file needs.
const INVISIBLE = /(?![\t\n\r])[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2028\u2029]/gu

export function findInvisibleCharacters(text) {
    return text.split('\n').flatMap((line, index) =>
        Array.from(line.matchAll(INVISIBLE), (match) => ({
            line: index + 1,
            column: Array.from(line.slice(0, match.index)).length + 1,
            codePoint: `U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
        })),
    )
}
