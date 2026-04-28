import { createHash } from 'crypto'
import { CoderUser } from './types'

export function shaHash(input: string): string {
    return createHash('sha256').update(input.toLowerCase()).digest('hex')
}

export function generateCoderUsername(researcherEmail: string): string {
    // Coder usernames must be alphanumeric with underscores, limited to 31 characters
    // Format: {sanitized_email}-{8_char_hash}
    const hash = shaHash(researcherEmail).slice(0, 8)
    const sanitized = researcherEmail.replace(/[^a-zA-Z0-9]/g, '-')
    // 31 total - 1 hyphen - 8 hash = 22 max for sanitized email
    const maxSanitizedLength = 22
    const truncatedSanitized = sanitized.slice(0, maxSanitizedLength)
    // Do a pass over the final username structure to convert multiple '-' into single
    const finalSanitized = `${truncatedSanitized}-${hash}`.replace(/-{2,}/g, '-')
    return finalSanitized
}

export function generateWorkspaceName(studyId: string, user: CoderUser): string {
    const studyHash = shaHash(studyId).slice(0, 10)
    const userHash = shaHash(user.id).slice(0, 4)
    return `${studyHash}-${userHash}`
}
