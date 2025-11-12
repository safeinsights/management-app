import { describe, expect, it } from 'vitest'
import { shaHash, uuidToStr } from './utils'

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
        expect(result).toBe('140f39b05a2d9de451b9b7ad2d1f4a26b16fb5e5c8b7cbde6154679102614882')
    })

    it('should handle md5hash case with UUID without hyphens', () => {
        const uuid = '550e8400e29b41d4a716446655440000'
        const result = uuidToStr(uuid, true)
        expect(result).toBe('140f39b05a2d9de451b9b7ad2d1f4a26b16fb5e5c8b7cbde6154679102614882')
    })

    it('should handle md5hash case with UUID with mixed case', () => {
        const uuid = '550E8400-E29B-41D4-A716-446655440000'
        const result = uuidToStr(uuid, true)
        expect(result).toBe('140f39b05a2d9de451b9b7ad2d1f4a26b16fb5e5c8b7cbde6154679102614882')
    })

    it('should handle md5hash case with truncated result', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = uuidToStr(uuid, true, 10)
        expect(result).toBe('140f39b05a')
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
        expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('should handle md5hash case with non-alphanumeric characters and length parameter', () => {
        const uuid = '---...___+++'
        const result = uuidToStr(uuid, true, 5)
        expect(result).toBe('e3b0c')
    })
})

describe('md5Hash', () => {
    it('should generate correct MD5 hash for empty string', () => {
        const result = shaHash('')
        expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('should generate consistent MD5 hash for same input', () => {
        const input = 'hello world'
        const result1 = shaHash(input)
        const result2 = shaHash(input)
        expect(result1).toBe(result2)
        expect(result1).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
    })

    it('should generate different hashes for different inputs', () => {
        const result1 = shaHash('hello')
        const result2 = shaHash('world')
        expect(result1).not.toBe(result2)
        expect(result1).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
        expect(result2).toBe('486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7')
    })

    it('should handle special characters correctly', () => {
        const result = shaHash('hello\nworld')
        expect(result).toBe('26c60a61d01db5836ca70fefd44a6a016620413c8ef5f259a6c5612d4f79d3b8')
    })

    it('should handle unicode characters', () => {
        const result = shaHash('café')
        expect(result).toBe('850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e')
    })

    it('should handle long strings', () => {
        const longString = 'a'.repeat(1000)
        const result = shaHash(longString)
        expect(result).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3')
    })

    it('should handle strings with spaces', () => {
        const result = shaHash('hello world')
        expect(result).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
    })
})
