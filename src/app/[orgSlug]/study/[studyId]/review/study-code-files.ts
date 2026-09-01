import type { StudyJobFileType } from '@/database/types'
import { isCodeFileType } from '@/lib/file-type-helpers'

export type CodeFile = { name: string; fileType: StudyJobFileType }

// Generic on the input element so callers needing the full file shape get it back, while callers
// typed against the narrower CodeFile still work.
export function filterAndOrderCodeFiles<T extends CodeFile>(files: readonly T[]): T[] {
    const codeFiles = files.filter((f) => isCodeFileType(f.fileType))
    const main = codeFiles.filter((f) => f.fileType === 'MAIN-CODE')
    const supplemental = codeFiles
        .filter((f) => f.fileType === 'SUPPLEMENTAL-CODE')
        .sort((a, b) => a.name.localeCompare(b.name))
    return [...main, ...supplemental]
}
