import type { FileType } from '@/database/types'

export const ENCRYPTED_LOG_TYPES: FileType[] = [
    'ENCRYPTED-CODE-RUN-LOG',
    'ENCRYPTED-SECURITY-SCAN-LOG',
    'ENCRYPTED-PACKAGING-ERROR-LOG',
]

export const APPROVED_LOG_TYPES: FileType[] = [
    'APPROVED-CODE-RUN-LOG',
    'APPROVED-SECURITY-SCAN-LOG',
    'APPROVED-PACKAGING-ERROR-LOG',
]

export const PLAINTEXT_LOG_TYPES: FileType[] = ['SECURITY-SCAN-LOG', 'PACKAGING-ERROR-LOG']

export const ENCRYPTED_TO_APPROVED: Record<string, FileType> = {
    'ENCRYPTED-RESULT': 'APPROVED-RESULT',
    'ENCRYPTED-CODE-RUN-LOG': 'APPROVED-CODE-RUN-LOG',
    'ENCRYPTED-SECURITY-SCAN-LOG': 'APPROVED-SECURITY-SCAN-LOG',
    'ENCRYPTED-PACKAGING-ERROR-LOG': 'APPROVED-PACKAGING-ERROR-LOG',
}

const LOG_LABELS: Partial<Record<FileType, string>> = {
    'APPROVED-CODE-RUN-LOG': 'Code Run Log',
    'APPROVED-SECURITY-SCAN-LOG': 'Security Scan Log',
    'APPROVED-PACKAGING-ERROR-LOG': 'Packaging Error Log',
    'ENCRYPTED-CODE-RUN-LOG': 'Code Run Log',
    'ENCRYPTED-SECURITY-SCAN-LOG': 'Security Scan Log',
    'ENCRYPTED-PACKAGING-ERROR-LOG': 'Packaging Error Log',
    'SECURITY-SCAN-LOG': 'Security Scan Log',
    'PACKAGING-ERROR-LOG': 'Packaging Error Log',
}

export function isEncryptedLogType(fileType: FileType): boolean {
    return ENCRYPTED_LOG_TYPES.includes(fileType)
}

export function isApprovedLogType(fileType: FileType): boolean {
    return APPROVED_LOG_TYPES.includes(fileType)
}

export function isPlaintextLogType(fileType: FileType): boolean {
    return PLAINTEXT_LOG_TYPES.includes(fileType)
}

export function isResultFile(f: { fileType: FileType }): boolean {
    return ['ENCRYPTED-RESULT', 'APPROVED-RESULT'].includes(f.fileType)
}

export function isLogType(fileType: FileType): boolean {
    return isEncryptedLogType(fileType) || isApprovedLogType(fileType) || isPlaintextLogType(fileType)
}

export function logLabel(fileType: FileType): string {
    return LOG_LABELS[fileType] ?? 'Results'
}

// Pre-PR #764 jobs stored results/logs as plaintext APPROVED-* / SECURITY-SCAN-LOG rows; newer jobs
// encrypt them for the researcher (ENCRYPTED-*). These two predicates classify a job's files so the
// results view can show legacy results directly while routing encrypted ones through the key flow.
export function isEncryptedArtifact(fileType: FileType): boolean {
    return isEncryptedLogType(fileType) || fileType === 'ENCRYPTED-RESULT'
}

export function isLegacyResultArtifact(fileType: FileType): boolean {
    return isApprovedLogType(fileType) || isPlaintextLogType(fileType) || fileType === 'APPROVED-RESULT'
}

export function jobHasEncryptedArtifacts(files: { fileType: FileType }[]): boolean {
    return files.some((f) => isEncryptedArtifact(f.fileType))
}

// A job is "legacy" for results purposes when it carries plaintext result artifacts and no encrypted
// ones. The no-encrypted guard keeps a job that has both (shouldn't happen, but defensively) on the
// encrypted path so nothing decryptable is silently skipped.
export function jobHasLegacyResults(files: { fileType: FileType }[]): boolean {
    return !jobHasEncryptedArtifacts(files) && files.some((f) => isLegacyResultArtifact(f.fileType))
}
