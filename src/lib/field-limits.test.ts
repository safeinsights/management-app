import { describe, expect, it } from '@/tests/unit.helpers'
import { countCharacters, overCharacterLimitError } from '@/lib/field-limits'

// Written as escapes rather than literals throughout, so no assertion depends on how this file
// happens to be normalized on disk.
const NFD_E_ACUTE = 'e\u0301' // 'e' plus a combining acute, the form Word tends to emit
const NFC_E_ACUTE = '\u00e9' // the same letter as one precomposed code point
const FAMILY_EMOJI = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}'

describe('countCharacters', () => {
    it('excludes surrounding whitespace and keeps interior whitespace', () => {
        expect(countCharacters('  a b  ')).toBe(3)
        expect(countCharacters('')).toBe(0)
        expect(countCharacters('   ')).toBe(0)
        expect(countCharacters('hello world')).toBe(11)
    })

    /**
     * The reason this is not `.length` (OTTER-737 review). UTF-16 code units charge the user for
     * storage rather than for what they typed, which the 60-character study title would show first:
     * a pasted title of 40 visible letters could pass the cap with nothing on screen to explain it.
     */
    it('counts what the user sees, not UTF-16 code units', () => {
        expect(NFD_E_ACUTE.length).toBe(2)
        expect(NFC_E_ACUTE.length).toBe(1)
        expect(countCharacters(NFD_E_ACUTE)).toBe(1)
        expect(countCharacters(NFC_E_ACUTE)).toBe(1)

        expect(FAMILY_EMOJI.length).toBe(11)
        expect(countCharacters(FAMILY_EMOJI)).toBe(1)

        // Either encoding of the same word has to read the same in the counter.
        expect(countCharacters(`caf${NFD_E_ACUTE}`)).toBe(4)
        expect(countCharacters(`caf${NFC_E_ACUTE}`)).toBe(4)
    })

    // The ASCII shortcut has to give the same answer as the segmenter, and CRLF is the one ASCII
    // sequence where they would part ways: UAX #29 joins it into a single cluster.
    it('agrees with itself across the ASCII shortcut', () => {
        expect(countCharacters('a\r\nb')).toBe(3)
        expect(countCharacters('a\nb')).toBe(3)
        expect(countCharacters('a\tb')).toBe(3)
    })
})

describe('overCharacterLimitError', () => {
    // The card's wording, which omits "character" before "limit".
    it('names the field and its cap', () => {
        expect(overCharacterLimitError('Study title', 60)).toBe(
            'Study title exceeds the 60 limit. Shorten it to continue.',
        )
    })
})
