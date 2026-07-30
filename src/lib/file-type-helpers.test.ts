import { describe, expect, it } from 'vitest'
import {
    dedupeJobArtifactFiles,
    isEncryptedArtifact,
    isLegacyResultArtifact,
    jobHasEncryptedArtifacts,
    jobHasLegacyResults,
} from './file-type-helpers'
import type { FileType } from '@/database/types'

describe('file-type-helpers result classification', () => {
    it('isEncryptedArtifact matches encrypted results and logs only', () => {
        expect(isEncryptedArtifact('ENCRYPTED-RESULT')).toBe(true)
        expect(isEncryptedArtifact('ENCRYPTED-CODE-RUN-LOG')).toBe(true)
        expect(isEncryptedArtifact('APPROVED-RESULT')).toBe(false)
        expect(isEncryptedArtifact('APPROVED-CODE-RUN-LOG')).toBe(false)
    })

    it('isLegacyResultArtifact matches plaintext approved results and logs', () => {
        expect(isLegacyResultArtifact('APPROVED-RESULT')).toBe(true)
        expect(isLegacyResultArtifact('APPROVED-SECURITY-SCAN-LOG')).toBe(true)
        expect(isLegacyResultArtifact('SECURITY-SCAN-LOG')).toBe(true)
        expect(isLegacyResultArtifact('ENCRYPTED-RESULT')).toBe(false)
    })

    it('jobHasEncryptedArtifacts is true when any encrypted artifact is present', () => {
        expect(jobHasEncryptedArtifacts([{ fileType: 'ENCRYPTED-RESULT' }])).toBe(true)
        expect(jobHasEncryptedArtifacts([{ fileType: 'APPROVED-RESULT' }])).toBe(false)
        expect(jobHasEncryptedArtifacts([])).toBe(false)
    })

    it('jobHasLegacyResults is true only for legacy artifacts with no encrypted ones', () => {
        expect(jobHasLegacyResults([{ fileType: 'APPROVED-RESULT' }])).toBe(true)
        expect(jobHasLegacyResults([{ fileType: 'APPROVED-CODE-RUN-LOG' }])).toBe(true)
        // both present → not legacy (stay on encrypted path)
        expect(jobHasLegacyResults([{ fileType: 'APPROVED-RESULT' }, { fileType: 'ENCRYPTED-RESULT' }])).toBe(false)
        // encrypted only → not legacy
        expect(jobHasLegacyResults([{ fileType: 'ENCRYPTED-RESULT' }])).toBe(false)
        // no result artifacts at all → not legacy
        expect(jobHasLegacyResults([{ fileType: 'MAIN-CODE' }])).toBe(false)
    })
})

describe('dedupeJobArtifactFiles', () => {
    const runLog = (
        id: string,
        overrides: { createdAt?: string; hasRecipientKeys?: boolean; path?: string; fileType?: FileType } = {},
    ) => ({
        id,
        name: 'encrypted-logs.zip',
        path: 'studies/org/study/jobs/job/results/encrypted-code-run-log.zip',
        fileType: 'ENCRYPTED-CODE-RUN-LOG' as FileType,
        createdAt: '2026-01-01T00:00:00Z',
        hasRecipientKeys: false,
        ...overrides,
    })

    it('collapses rows sharing a storage path down to one', () => {
        const files = [runLog('a', { createdAt: '2026-01-01T00:00:00Z' }), runLog('b', { createdAt: '2026-01-02' })]

        expect(dedupeJobArtifactFiles(files).map((f) => f.id)).toEqual(['b'])
    })

    it('keeps the released row even when an unreleased duplicate is newer', () => {
        const released = runLog('a', { createdAt: '2026-01-01T00:00:00Z', hasRecipientKeys: true })
        const newer = runLog('b', { createdAt: '2026-06-01T00:00:00Z' })

        expect(dedupeJobArtifactFiles([released, newer]).map((f) => f.id)).toEqual(['a'])
        // order of arrival must not change which row wins
        expect(dedupeJobArtifactFiles([newer, released]).map((f) => f.id)).toEqual(['a'])
    })

    it('breaks a createdAt tie deterministically instead of picking arbitrarily', () => {
        const first = runLog('aaa')
        const second = runLog('bbb')

        expect(dedupeJobArtifactFiles([first, second]).map((f) => f.id)).toEqual(['bbb'])
        expect(dedupeJobArtifactFiles([second, first]).map((f) => f.id)).toEqual(['bbb'])
    })

    it('leaves artifacts of different types alone and preserves input order', () => {
        const files = [
            runLog('scan', {
                path: 'studies/org/study/jobs/job/results/encrypted-security-scan-log.zip',
                fileType: 'ENCRYPTED-SECURITY-SCAN-LOG',
            }),
            runLog('run'),
            runLog('result', {
                path: 'studies/org/study/jobs/job/results/encrypted-results.zip',
                fileType: 'ENCRYPTED-RESULT',
            }),
        ]

        expect(dedupeJobArtifactFiles(files).map((f) => f.id)).toEqual(['scan', 'run', 'result'])
    })

    // Run logs and results were both stored at results/encrypted-results.zip until mid-2025, so a job
    // from that era holds two rows of different types on one path. Keying on the path alone would drop
    // one of them from every list, taking its download and decrypt with it.
    it('keeps a legacy log and result that share one storage path', () => {
        const legacyPath = 'studies/org/study/jobs/job/results/encrypted-results.zip'
        const files = [
            runLog('log', { path: legacyPath }),
            runLog('result', { path: legacyPath, fileType: 'ENCRYPTED-RESULT' }),
        ]

        expect(dedupeJobArtifactFiles(files).map((f) => f.id)).toEqual(['log', 'result'])
    })

    it('never collapses code files, which are keyed by filename and out of scope', () => {
        const codeFile = (id: string, fileType: FileType) => ({
            id,
            name: 'main.R',
            path: 'studies/org/study/jobs/job/code/main.R',
            fileType,
            createdAt: '2026-01-01T00:00:00Z',
            hasRecipientKeys: false,
        })
        const files = [codeFile('main', 'MAIN-CODE'), codeFile('supplemental', 'SUPPLEMENTAL-CODE')]

        expect(dedupeJobArtifactFiles(files).map((f) => f.id)).toEqual(['main', 'supplemental'])
    })

    it('handles a missing createdAt without dropping the row', () => {
        const files = [{ id: 'a', path: 'p', fileType: 'ENCRYPTED-RESULT' as FileType }]

        expect(dedupeJobArtifactFiles(files).map((f) => f.id)).toEqual(['a'])
    })
})
