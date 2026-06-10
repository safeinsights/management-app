import { describe, it, expect } from 'vitest'
import { strToAscii, slugify, getInitials } from './string'

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
