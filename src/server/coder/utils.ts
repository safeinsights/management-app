import { createHash } from 'crypto'

export function shaHash(input: string): string {
    return createHash('sha256').update(input.toLowerCase()).digest('hex')
}

export function generateWorkspaceName(studyId: string): string {
    // Workspace names are limited to 10 characters
    return shaHash(studyId).slice(0, 10)
}
