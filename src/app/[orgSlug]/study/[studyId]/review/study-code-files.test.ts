import { describe, it, expect } from 'vitest'
import type { StudyJobFileType } from '@/database/types'
import { filterAndOrderCodeFiles, type CodeFile } from './study-code-files'

const file = (name: string, fileType: StudyJobFileType): CodeFile => ({ name, fileType })

describe('filterAndOrderCodeFiles', () => {
    it('drops non-code file types (security scan logs, encrypted artifacts, results)', () => {
        const result = filterAndOrderCodeFiles([
            file('main.R', 'MAIN-CODE'),
            file('helper.R', 'SUPPLEMENTAL-CODE'),
            file('security-scan.txt', 'SECURITY-SCAN-LOG'),
            file('encrypted-logs.zip', 'ENCRYPTED-SECURITY-SCAN-LOG'),
            file('result.csv', 'APPROVED-RESULT'),
            file('packaging-error.log', 'PACKAGING-ERROR-LOG'),
        ])

        expect(result.map((f) => f.name)).toEqual(['main.R', 'helper.R'])
    })

    it('puts MAIN-CODE first and sorts SUPPLEMENTAL-CODE alphabetically regardless of input order', () => {
        const result = filterAndOrderCodeFiles([
            file('zeta.R', 'SUPPLEMENTAL-CODE'),
            file('alpha.R', 'SUPPLEMENTAL-CODE'),
            file('main.R', 'MAIN-CODE'),
            file('beta.R', 'SUPPLEMENTAL-CODE'),
        ])

        expect(result.map((f) => f.name)).toEqual(['main.R', 'alpha.R', 'beta.R', 'zeta.R'])
    })

    it('returns an empty array when no code files are present', () => {
        const result = filterAndOrderCodeFiles([
            file('security-scan.txt', 'SECURITY-SCAN-LOG'),
            file('result.csv', 'APPROVED-RESULT'),
        ])

        expect(result).toEqual([])
    })

    it('preserves extra fields on the input element (generic shape)', () => {
        const created = new Date('2026-01-15T10:00:00Z')
        const input = [
            { name: 'main.R', fileType: 'MAIN-CODE' as const, createdAt: created, sizeBytes: 1234 },
            { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' as const, createdAt: created, sizeBytes: 567 },
            { name: 'scan.txt', fileType: 'SECURITY-SCAN-LOG' as const, createdAt: created, sizeBytes: 42 },
        ]

        const result = filterAndOrderCodeFiles(input)

        expect(result).toEqual([
            { name: 'main.R', fileType: 'MAIN-CODE', createdAt: created, sizeBytes: 1234 },
            { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE', createdAt: created, sizeBytes: 567 },
        ])
        expect(result[0].createdAt).toBe(created)
        expect(result[0].sizeBytes).toBe(1234)
    })
})
