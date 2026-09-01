import { describe, expect, it } from '@/tests/unit.helpers'
import { countCharacters, overCharacterLimitError } from '@/lib/field-limits'

// Escapes rather than literals, so no assertion depends on how this file is normalized on disk.
const NFD_E_ACUTE = 'e\u0301'
const NFC_E_ACUTE = '\u00e9'
const FAMILY_EMOJI = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}'

describe('countCharacters', () => {
    it('excludes surrounding whitespace and keeps interior whitespace', () => {
        expect(countCharacters('  a b  ')).toBe(3)
        expect(countCharacters('')).toBe(0)
        expect(countCharacters('   ')).toBe(0)
        expect(countCharacters('hello world')).toBe(11)
    })

    // Why this is not `.length` (OTTER-737): code units charge for storage, not for what the
    // user typed.
    it('counts what the user sees, not UTF-16 code units', () => {
        expect(NFD_E_ACUTE.length).toBe(2)
        expect(NFC_E_ACUTE.length).toBe(1)
        expect(countCharacters(NFD_E_ACUTE)).toBe(1)
        expect(countCharacters(NFC_E_ACUTE)).toBe(1)

        expect(FAMILY_EMOJI.length).toBe(11)
        expect(countCharacters(FAMILY_EMOJI)).toBe(1)

        expect(countCharacters(`caf${NFD_E_ACUTE}`)).toBe(4)
        expect(countCharacters(`caf${NFC_E_ACUTE}`)).toBe(4)
    })

    // CRLF is the one ASCII sequence where the shortcut and the segmenter could part ways:
    // UAX #29 joins it into a single cluster.
    it('agrees with itself across the ASCII shortcut', () => {
        expect(countCharacters('a\r\nb')).toBe(3)
        expect(countCharacters('a\nb')).toBe(3)
        expect(countCharacters('a\tb')).toBe(3)
    })
})

describe('overCharacterLimitError', () => {
    // The card's wording, including the literal "character" before "limit".
    it('names the field and its cap', () => {
        expect(overCharacterLimitError('Study title', 60)).toBe(
            'Study title exceeds the 60 character limit. Shorten it to continue.',
        )
    })
})
