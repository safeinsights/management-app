import { describe, expect, it } from 'vitest'
import { md5Hash, uuidToStr } from './utils'

describe('uuidToStr', () => {
    it('should convert a UUID with hyphens to lowercase alphanumeric string', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = uuidToStr(uuid, false)
        expect(result).toBe('550e8400e29b41d4a716446655440000')
    })

    it('should handle UUID without hyphens', () => {
        const uuid = '550e8400e29b41d4a716446655440000'
        const result = uuidToStr(uuid, false)
        expect(result).toBe('550e8400e29b41d4a716446655440000')
    })

    it('should handle UUID with mixed case', () => {
        const uuid = '550E8400-E29B-41D4-A716-446655440000'
        const result = uuidToStr(uuid, false)
        expect(result).toBe('550e8400e29b41d4a716446655440000')
    })

    it('should truncate result when length parameter is provided', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = uuidToStr(uuid, false, 10)
        expect(result).toBe('550e8400e2')
    })

    it('should return full string when length parameter is greater than string length', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = uuidToStr(uuid, false, 50)
        expect(result).toBe('550e8400e29b41d4a716446655440000')
    })

    it('should handle empty string', () => {
        const result = uuidToStr('', false)
        expect(result).toBe('')
    })

    it('should handle empty string with length parameter', () => {
        const result = uuidToStr('', false, 5)
        expect(result).toBe('')
    })

    it('should handle string with only non-alphanumeric characters', () => {
        const uuid = '---...___+++'
        const result = uuidToStr(uuid, false)
        expect(result).toBe('')
    })

    it('should handle string with only non-alphanumeric characters and length parameter', () => {
        const uuid = '---...___+++'
        const result = uuidToStr(uuid, false, 5)
        expect(result).toBe('')
    })

    it('should handle UUID with leading/trailing whitespace', () => {
        const uuid = '  550e8400-e29b-41d4-a716-446655440000  '
        const result = uuidToStr(uuid, false)
        expect(result).toBe('550e8400e29b41d4a716446655440000')
    })

    it('should handle md5hash case with UUID', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = uuidToStr(uuid, true)
        expect(result).toBe('85e8facda919890c2ffa07913d3654ad')
    })

    it('should handle md5hash case with UUID without hyphens', () => {
        const uuid = '550e8400e29b41d4a716446655440000'
        const result = uuidToStr(uuid, true)
        expect(result).toBe('85e8facda919890c2ffa07913d3654ad')
    })

    it('should handle md5hash case with UUID with mixed case', () => {
        const uuid = '550E8400-E29B-41D4-A716-446655440000'
        const result = uuidToStr(uuid, true)
        expect(result).toBe('85e8facda919890c2ffa07913d3654ad')
    })

    it('should handle md5hash case with truncated result', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = uuidToStr(uuid, true, 10)
        expect(result).toBe('85e8facda9')
    })

    it('should handle md5hash case with empty string', () => {
        const result = uuidToStr('', true)
        expect(result).toBe('')
    })

    it('should handle md5hash case with empty string and length parameter', () => {
        const result = uuidToStr('', true, 5)
        expect(result).toBe('')
    })

    it('should handle md5hash case with non-alphanumeric characters', () => {
        const uuid = '---...___+++'
        const result = uuidToStr(uuid, true)
        expect(result).toBe('d41d8cd98f00b204e9800998ecf8427e')
    })

    it('should handle md5hash case with non-alphanumeric characters and length parameter', () => {
        const uuid = '---...___+++'
        const result = uuidToStr(uuid, true, 5)
        expect(result).toBe('d41d8')
    })
})

describe('md5Hash', () => {
    it('should generate correct MD5 hash for empty string', () => {
        const result = md5Hash('')
        expect(result).toBe('d41d8cd98f00b204e9800998ecf8427e')
    })

    it('should generate consistent MD5 hash for same input', () => {
        const input = 'hello world'
        const result1 = md5Hash(input)
        const result2 = md5Hash(input)
        expect(result1).toBe(result2)
        expect(result1).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3')
    })

    it('should generate different hashes for different inputs', () => {
        const result1 = md5Hash('hello')
        const result2 = md5Hash('world')
        expect(result1).not.toBe(result2)
        expect(result1).toBe('5d41402abc4b2a76b9719d911017c592')
        expect(result2).toBe('7d793037a0760186574b0282f2f435e7')
    })

    it('should handle special characters correctly', () => {
        const result = md5Hash('hello\nworld')
        expect(result).toBe('9195d0beb2a889e1be05ed6bb1954837')
    })

    it('should handle unicode characters', () => {
        const result = md5Hash('café')
        expect(result).toBe('07117fe4a1ebd544965dc19573183da2')
    })

    it('should handle long strings', () => {
        const longString = 'a'.repeat(1000)
        const result = md5Hash(longString)
        expect(result).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8')
    })

    it('should handle strings with spaces', () => {
        const result = md5Hash('hello world')
        expect(result).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3')
    })
})
