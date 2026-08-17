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

// Logs that say something about a FAILED run, as opposed to any log at all. Three unrelated
// services write into the ENCRYPTED-* set: the code scanner (on submission), the containerizer (on
// a packaging failure), and the enclave (when a container exits non-zero). Asking "does this job
// have any log?" therefore answers a different question from "can this reviewer find out why the
// run failed?", and conflating the two is how an errored job with nothing but a security scan log
// came to promise error logs it did not have (OTTER-524).
const ENCRYPTED_ERROR_LOG_TYPES: FileType[] = ['ENCRYPTED-CODE-RUN-LOG', 'ENCRYPTED-PACKAGING-ERROR-LOG']

// The same logs in a form no security key opens. PACKAGING-ERROR-LOG is written on its own when the
// org has no key holders, so encryptAndStoreLog produced nothing to pair it with; the APPROVED-*
// pair are pre-#764 legacy rows. Kept separate from the encrypted set because the reviewer's screen
// must promise a key form only for logs a key can actually open.
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

/**
 * The encrypted artifacts that describe THIS run's outcome: what it produced, and the log saying why
 * it failed. The single gate the reviewer's errored screen turns on, so that what the banner promises
 * and what the screen renders cannot disagree (OTTER-524).
 *
 * ENCRYPTED-SECURITY-SCAN-LOG is deliberately excluded. It is written by the code scanner at
 * submission, is already surfaced on the code review step, and says nothing about a run, so an
 * errored job carrying only that log has genuinely nothing for a key to open here. Including it is
 * what produced a key form under a banner reading "there is no error log for this run", and an
 * enabled "share outputs" that would have shared a submission-time scan log as the run's outputs.
 */
export function jobHasDecryptableRunOutcome(files: ReadonlyArray<{ fileType: FileType }>): boolean {
    return files.some((f) => f.fileType === 'ENCRYPTED-RESULT' || ENCRYPTED_ERROR_LOG_TYPES.includes(f.fileType))
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
