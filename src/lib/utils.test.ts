import { describe, expect, it } from 'vitest'
import { uuidToStr } from './utils'

describe('uuidToStr', () => {
    it('should convert a UUID with hyphens to lowercase alphanumeric string', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = uuidToStr(uuid)
        expect(result).toBe('550e8400e29b41d4a716446655440000')
    })

    it('should handle UUID without hyphens', () => {
        const uuid = '550e8400e29b41d4a716446655440000'
        const result = uuidToStr(uuid)
        expect(result).toBe('550e8400e29b41d4a716446655440000')
    })

    it('should handle UUID with mixed case', () => {
        const uuid = '550E8400-E29B-41D4-A716-446655440000'
        const result = uuidToStr(uuid)
        expect(result).toBe('550e8400e29b41d4a716446655440000')
    })

    it('should truncate result when length parameter is provided', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = uuidToStr(uuid, 10)
        expect(result).toBe('550e8400e2')
    })

    it('should return full string when length parameter is greater than string length', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        const result = uuidToStr(uuid, 50)
        expect(result).toBe('550e8400e29b41d4a716446655440000')
    })

    it('should handle empty string', () => {
        const result = uuidToStr('')
        expect(result).toBe('')
    })

    it('should handle empty string with length parameter', () => {
        const result = uuidToStr('', 5)
        expect(result).toBe('')
    })

    it('should handle string with only non-alphanumeric characters', () => {
        const uuid = '---...___+++'
        const result = uuidToStr(uuid)
        expect(result).toBe('')
    })

    it('should handle string with only non-alphanumeric characters and length parameter', () => {
        const uuid = '---...___+++'
        const result = uuidToStr(uuid, 5)
        expect(result).toBe('')
    })

    it('should handle UUID with leading/trailing whitespace', () => {
        const uuid = '  550e8400-e29b-41d4-a716-446655440000  '
        const result = uuidToStr(uuid)
        expect(result).toBe('550e8400e29b41d4a716446655440000')
    })
})
