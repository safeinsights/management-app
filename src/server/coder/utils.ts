import { createHash } from 'crypto'

const CODER_WORKSPACE_NAME_LIMIT = 10

export function shaHash(input: string): string {
    return createHash('sha256').update(input).digest('hex')
}

export function generateUsername(email: string, userId: string): string {
    let username = shaHash(`${email}${userId}`)
    if (username.length >= 32) {
        username = username.substring(0, 31)
    }
    return username
}

export function generateWorkspaceName(studyId: string): string {
    if (!studyId) return ''
    const result = shaHash(studyId.replaceAll(/[^a-z0-9]/gi, '').toLowerCase())
    return result.substring(0, CODER_WORKSPACE_NAME_LIMIT)
}
