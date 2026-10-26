import { describe, expect, it } from 'vitest'
import { findInvisibleCharacters } from './invisible-unicode.mjs'

const withNames = (codePoints) => codePoints.map((cp) => [`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, cp])

describe('findInvisibleCharacters', () => {
    it.each(withNames([0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]))(
        'reports the bidi control %s',
        (codePoint, cp) => {
            expect(findInvisibleCharacters(`a${String.fromCodePoint(cp)}b`)).toEqual([
                { line: 1, column: 2, codePoint },
            ])
        },
    )

    it.each(
        withNames([
            0x200b, 0x200c, 0x200d, 0x2060, 0x2063, 0xfeff, 0x200e, 0x200f, 0x061c, 0x00ad, 0x034f, 0x3164, 0x115f,
            0xffa0, 0xfe0f, 0xe0001, 0xe0041, 0xe007f, 0xe0100, 0xe01ef, 0x2028, 0x0007, 0x001b,
        ]),
    )('reports the invisible character %s', (codePoint, cp) => {
        expect(findInvisibleCharacters(`a${String.fromCodePoint(cp)}b`)).toEqual([{ line: 1, column: 2, codePoint }])
    })

    it('reports astral code points with five hex digits', () => {
        expect(findInvisibleCharacters('\u{E0041}')).toEqual([{ line: 1, column: 1, codePoint: 'U+E0041' }])
    })

    it('reports a byte order mark at the start of the text', () => {
        expect(findInvisibleCharacters('\uFEFFexport const a = 1\n')).toEqual([
            { line: 1, column: 1, codePoint: 'U+FEFF' },
        ])
    })

    it.each([
        'plain ASCII\twith a tab\n',
        'a\r\nb\r\n',
        'caf\u00E9',
        '\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC',
        '\u65E5\u672C\u8A9E',
        '\u05E2\u05D1\u05E8\u05D9\u05EA',
        '\u0627\u0644\u0639\u0631\u0628\u064A\u0629',
        'no-break\u00A0space',
        'emoji without selector \u{1F418} \u{1F9ED} \u{1F527}',
        'typography \u2014 \u2713 \u2192 \u2500',
    ])('accepts visible text: %j', (text) => {
        expect(findInvisibleCharacters(text)).toEqual([])
    })

    it('reports the line of a finding in multi-line text', () => {
        expect(findInvisibleCharacters('one\ntwo\nthr\u200Bee\n')).toEqual([
            { line: 3, column: 4, codePoint: 'U+200B' },
        ])
    })

    it('counts an astral character before a finding as one column', () => {
        expect(findInvisibleCharacters('\u{1F418}\u202E')).toEqual([{ line: 1, column: 2, codePoint: 'U+202E' }])
    })

    it('reports every finding on a line in order', () => {
        expect(findInvisibleCharacters('a\u202Eb\u2066c')).toEqual([
            { line: 1, column: 2, codePoint: 'U+202E' },
            { line: 1, column: 4, codePoint: 'U+2066' },
        ])
    })
})
