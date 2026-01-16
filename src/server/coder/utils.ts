import { createHash } from 'crypto'

export function shaHash(input: string): string {
    return createHash('sha256').update(input.toLowerCase()).digest('hex')
}

export function generateCoderUsername(researcherEmail: string): string {
    // Coder usernames must be alphanumeric with underscores, limited to 31 characters
    // Format: {sanitized_email}-{8_char_hash}
    const hash = shaHash(researcherEmail).slice(0, 8)
    const sanitized = researcherEmail.replace(/[^a-zA-Z0-9]/g, '_')
    // 31 total - 1 hyphen - 8 hash = 22 max for sanitized email
    const maxSanitizedLength = 22
    const truncatedSanitized = sanitized.slice(0, maxSanitizedLength)
    return `${truncatedSanitized}-${hash}`
}

export function generateWorkspaceName(studyId: string): string {
    // Workspace names are limited to 10 characters
    return shaHash(studyId).slice(0, 10)
}
