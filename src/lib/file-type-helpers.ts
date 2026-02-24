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

const ENCRYPTED_TO_APPROVED: Record<string, FileType> = {
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
}

export function approvedTypeForFile(fileType: FileType): FileType {
    const approved = ENCRYPTED_TO_APPROVED[fileType]
    if (!approved) throw new Error(`Unknown file type ${fileType}`)
    return approved
}

export function isEncryptedLogType(fileType: FileType): boolean {
    return ENCRYPTED_LOG_TYPES.includes(fileType)
}

export function isApprovedLogType(fileType: FileType): boolean {
    return APPROVED_LOG_TYPES.includes(fileType)
}

export function isLogType(fileType: FileType): boolean {
    return isEncryptedLogType(fileType) || isApprovedLogType(fileType)
}

export function logLabel(fileType: FileType): string {
    return LOG_LABELS[fileType] ?? 'Results'
}
