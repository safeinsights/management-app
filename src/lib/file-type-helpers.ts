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

export type DedupableJobFile = {
    id: string
    path: string
    fileType: FileType
    hasRecipientKeys?: boolean
    createdAt?: Date | string | null
}

function timeValue(createdAt: DedupableJobFile['createdAt']): number {
    if (!createdAt) return 0
    const ms = new Date(createdAt).getTime()
    return Number.isNaN(ms) ? 0 : ms
}

// Recipient keys win over recency: those rows are what a researcher's wrapped AES keys and the
// reviewer's "shared with lab" indicator hang off, so dropping one would revoke access to a file
// that was already released. Only then newest, then the higher id to break a createdAt tie
// (jsonArrayFrom returns rows in no guaranteed order, so an arbitrary winner would make the
// surviving row - and therefore the decrypted rows keyed on its id - flip between requests).
function preferredArtifact<T extends DedupableJobFile>(a: T, b: T): T {
    if (Boolean(a.hasRecipientKeys) !== Boolean(b.hasRecipientKeys)) return a.hasRecipientKeys ? a : b
    const byTime = timeValue(a.createdAt) - timeValue(b.createdAt)
    if (byTime !== 0) return byTime > 0 ? a : b
    return a.id > b.id ? a : b
}

/**
 * Collapse a job's run/scan artifacts to one row per storage path (OTTER-642).
 *
 * A re-delivered ingest webhook used to add a second `study_job_file` row for an artifact the job
 * already had, surfacing as a doubled log/result in the reviewer and researcher views. Every such row
 * points at the SAME S3 object: the path is derived from the job and the artifact type
 * (`pathForStudyJob` + the file type, see server/storage.ts), so a repeat delivery overwrote the
 * object in place. Collapsing them therefore hides no content that the surviving row doesn't already
 * carry.
 *
 * Code files are left alone: their paths are keyed by filename rather than by artifact slot, two
 * genuinely different supplemental files are expected to coexist, and OTTER-642 scopes them out.
 *
 * Input order is preserved so callers' existing list ordering is unchanged.
 */
export function dedupeJobArtifactFiles<T extends DedupableJobFile>(files: T[]): T[] {
    const winnerByPath = new Map<string, T>()
    for (const file of files) {
        if (isCodeFileType(file.fileType)) continue
        const current = winnerByPath.get(file.path)
        winnerByPath.set(file.path, current ? preferredArtifact(current, file) : file)
    }

    return files.filter((file) => isCodeFileType(file.fileType) || winnerByPath.get(file.path) === file)
}
