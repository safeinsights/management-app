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

export const CODE_FILE_TYPES: FileType[] = ['MAIN-CODE', 'SUPPLEMENTAL-CODE']

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

export function isCodeFileType(fileType: FileType): boolean {
    return CODE_FILE_TYPES.includes(fileType)
}

export function isLogType(fileType: FileType): boolean {
    return isEncryptedLogType(fileType) || isApprovedLogType(fileType) || isPlaintextLogType(fileType)
}

// Logs about a FAILED run, not any log: conflating the two made an errored job with only a
// security scan log promise error logs (OTTER-524).
const ENCRYPTED_ERROR_LOG_TYPES: FileType[] = ['ENCRYPTED-CODE-RUN-LOG', 'ENCRYPTED-PACKAGING-ERROR-LOG']

// Overlaps the encrypted set on a packaging failure, so only errorLogSentence's
// decryptable-first ordering stops a readable log reading as unopenable.
// APPROVED-SECURITY-SCAN-LOG is left out on purpose, like its ENCRYPTED twin: a scan log says
// nothing about a failed run (OTTER-524), so completing the APPROVED-* trio would make a legacy
// scan-log-only errored job falsely claim an error log was recorded.
const UNDECRYPTABLE_ERROR_LOG_TYPES: FileType[] = [
    'PACKAGING-ERROR-LOG',
    'APPROVED-CODE-RUN-LOG',
    'APPROVED-PACKAGING-ERROR-LOG',
]

export function filesIncludeDecryptableErrorLog(files: ReadonlyArray<{ fileType: FileType }>): boolean {
    return files.some((f) => ENCRYPTED_ERROR_LOG_TYPES.includes(f.fileType))
}

export function filesIncludeUndecryptableErrorLog(files: ReadonlyArray<{ fileType: FileType }>): boolean {
    return files.some((f) => UNDECRYPTABLE_ERROR_LOG_TYPES.includes(f.fileType))
}

// ENCRYPTED-SECURITY-SCAN-LOG is excluded: it is written at submission and says nothing
// about a run (OTTER-524).
export function jobHasDecryptableRunOutcome(files: ReadonlyArray<{ fileType: FileType }>): boolean {
    return files.some((f) => f.fileType === 'ENCRYPTED-RESULT' || ENCRYPTED_ERROR_LOG_TYPES.includes(f.fileType))
}

export function logLabel(fileType: FileType): string {
    return LOG_LABELS[fileType] ?? 'Results'
}

// Pre-PR #764 jobs stored results/logs as plaintext APPROVED-* / SECURITY-SCAN-LOG rows;
// newer jobs encrypt them for the researcher.
export function isEncryptedArtifact(fileType: FileType): boolean {
    return isEncryptedLogType(fileType) || fileType === 'ENCRYPTED-RESULT'
}

export function isLegacyResultArtifact(fileType: FileType): boolean {
    return isApprovedLogType(fileType) || isPlaintextLogType(fileType) || fileType === 'APPROVED-RESULT'
}

export function jobHasEncryptedArtifacts(files: { fileType: FileType }[]): boolean {
    return files.some((f) => isEncryptedArtifact(f.fileType))
}

// The no-encrypted guard keeps a job carrying both on the encrypted path so nothing
// decryptable is silently skipped.
export function jobHasLegacyResults(files: { fileType: FileType }[]): boolean {
    return !jobHasEncryptedArtifacts(files) && files.some((f) => isLegacyResultArtifact(f.fileType))
}
