import { describe, it, expect } from 'vitest'
import { strToAscii, slugify, getInitials, shellQuote, substituteEntryPointFile } from './string'

describe('getInitials', () => {
    it('returns the uppercased first initial for a single name', () => {
        expect(getInitials('Ada')).toBe('A')
        expect(getInitials('ada')).toBe('A')
    })

    it('returns first + last initials for a full name', () => {
        expect(getInitials('Ada Lovelace')).toBe('AL')
    })

    it('uses the first and last word for three or more names', () => {
        expect(getInitials('Katherine Coleman Johnson')).toBe('KJ')
    })

    it('ignores extra surrounding and internal whitespace', () => {
        expect(getInitials('  Ada   Lovelace  ')).toBe('AL')
    })

    it('returns an empty string for empty or whitespace-only input', () => {
        expect(getInitials('')).toBe('')
        expect(getInitials('   ')).toBe('')
    })
})

describe('strToAscii', () => {
    it('removes non-alphanumeric characters', () => {
        const input = 'Hello, World!'
        const output = strToAscii(input)
        expect(output).toBe('HelloWorld')
    })

    it('removes special characters from a mixed string', () => {
        expect(strToAscii('abc@#$def')).toBe('abcdef')
    })

    it('returns an empty string for an empty input', () => {
        expect(strToAscii('')).toBe('')
    })
})

describe('slugify', () => {
    it('trims whitespace and lowercases the input', () => {
        const input = '  Hello World  '
        const output = slugify(input)
        expect(output).toBe('hello-world')
    })

    it('removes accents and swaps characters as defined', () => {
        const input = 'àáäâèéëêìíïîòóöôùúüûñç·/_,:;'
        const expected = 'aaaaeeeeiiiioooouuuunc-'
        expect(slugify(input)).toBe(expected)
    })

    it('replaces spaces with hyphens and removes invalid characters', () => {
        const input = 'Hello, world! This is @ test'
        const expected = 'hello-world-this-is-test'
        expect(slugify(input)).toBe(expected)
    })

    it('truncates the slug to 50 characters', () => {
        const input = 'this is a very long string that should be truncated at fifty characters exactly'
        const output = slugify(input)

        expect(output).toBe('this-is-a-very-long-string-that-should-be-truncate')
        expect(output).toHaveLength(50)
    })
})

describe('shellQuote', () => {
    it('wraps a simple value in single quotes', () => {
        expect(shellQuote('main.R')).toBe("'main.R'")
    })

    it('keeps parentheses literal so they do not break /bin/sh (OTTER-477)', () => {
        expect(shellQuote('main(1).r')).toBe("'main(1).r'")
    })

    it('quotes spaces and other shell metacharacters', () => {
        expect(shellQuote('my file;rm -rf $HOME.r')).toBe("'my file;rm -rf $HOME.r'")
    })

    it('escapes embedded single quotes', () => {
        expect(shellQuote("it's.r")).toBe("'it'\\''s.r'")
    })

    it('handles an empty string', () => {
        expect(shellQuote('')).toBe("''")
    })
})

describe('substituteEntryPointFile', () => {
    it('quotes a bare %f token', () => {
        expect(substituteEntryPointFile('Rscript %f', 'main(1).r')).toBe("Rscript 'main(1).r'")
    })

    it('replaces every %f occurrence', () => {
        expect(substituteEntryPointFile('cp %f /tmp/ && Rscript %f', 'main(1).r')).toBe(
            "cp 'main(1).r' /tmp/ && Rscript 'main(1).r'",
        )
    })

    it('absorbs double quotes an admin wrapped around %f instead of double-quoting (OTTER-477 follow-up)', () => {
        // Without absorbing, "%f" -> "'main_revised (1).R'", which /bin/sh hands to R as the
        // literal 'main_revised (1).R' (Greg Fitch: cannot open file ''main_revised (1).R'').
        expect(substituteEntryPointFile('Rscript "%f"', 'main_revised (1).R')).toBe("Rscript 'main_revised (1).R'")
    })

    it('absorbs single quotes an admin wrapped around %f instead of re-exposing parens', () => {
        // Without absorbing, '%f' -> ''main(1).r'', whose parens are unquoted -> `(` syntax error.
        expect(substituteEntryPointFile("Rscript '%f'", 'main(1).r')).toBe("Rscript 'main(1).r'")
    })

    it('leaves quotes elsewhere in the template untouched', () => {
        expect(substituteEntryPointFile('Rscript %f --title "My Study"', 'main.R')).toBe(
            'Rscript \'main.R\' --title "My Study"',
        )
    })

    it('does not absorb a non-matching quote pair around %f', () => {
        // Mismatched quotes are a malformed template; only the inner bare %f is quoted.
        expect(substituteEntryPointFile(`"%f'`, 'main.R')).toBe(`"'main.R''`)
    })

    it('escapes embedded single quotes in the filename', () => {
        expect(substituteEntryPointFile('Rscript "%f"', "it's.r")).toBe("Rscript 'it'\\''s.r'")
    })

    it('returns the template unchanged when there is no %f token', () => {
        expect(substituteEntryPointFile('Rscript main.R', 'ignored.r')).toBe('Rscript main.R')
    })
})
