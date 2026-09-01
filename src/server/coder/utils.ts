import { createHash } from 'crypto'

export function shaHash(input: string): string {
    return createHash('sha256').update(input.toLowerCase()).digest('hex')
}

export function generateCoderUsername(researcherEmail: string): string {
    // Coder usernames are alphanumeric, max 31 chars: {sanitized_email}-{8_char_hash}.
    const hash = shaHash(researcherEmail).slice(0, 8)
    const sanitized = researcherEmail.replace(/[^a-zA-Z0-9]/g, '-')
    const maxSanitizedLength = 22
    const truncatedSanitized = sanitized.slice(0, maxSanitizedLength)
    const finalSanitized = `${truncatedSanitized}-${hash}`.replace(/-{2,}/g, '-')
    return finalSanitized
}

export function generateWorkspaceName(studyId: string): string {
    return shaHash(studyId).slice(0, 10)
}
