import type { StudyJobFileType } from '@/database/types'

export type CodeFile = { name: string; fileType: StudyJobFileType }

const CODE_FILE_TYPES: StudyJobFileType[] = ['MAIN-CODE', 'SUPPLEMENTAL-CODE']

// MAIN-CODE files first, then SUPPLEMENTAL-CODE alphabetized. Generic on the
// input element so callers that need the full file shape (e.g. for createdAt)
// get it back, while callers typed against the narrower CodeFile still work.
export function filterAndOrderCodeFiles<T extends CodeFile>(files: readonly T[]): T[] {
    const codeFiles = files.filter((f) => CODE_FILE_TYPES.includes(f.fileType))
    const main = codeFiles.filter((f) => f.fileType === 'MAIN-CODE')
    const supplemental = codeFiles
        .filter((f) => f.fileType === 'SUPPLEMENTAL-CODE')
        .sort((a, b) => a.name.localeCompare(b.name))
    return [...main, ...supplemental]
}
