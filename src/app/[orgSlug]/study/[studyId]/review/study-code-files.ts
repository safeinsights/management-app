import type { StudyJobFileType } from '@/database/types'
import type { LatestJobForStudy } from '@/server/db/queries'

export type CodeFile = { name: string; fileType: StudyJobFileType }

const CODE_FILE_TYPES: StudyJobFileType[] = ['MAIN-CODE', 'SUPPLEMENTAL-CODE']

// MAIN-CODE files first, then SUPPLEMENTAL-CODE alphabetized — keeps the entry
// point file pinned to the leftmost tab regardless of insertion order.
export function filterAndOrderCodeFiles(files: LatestJobForStudy['files']): CodeFile[] {
    const codeFiles = files.filter((f) => CODE_FILE_TYPES.includes(f.fileType))
    const main = codeFiles.filter((f) => f.fileType === 'MAIN-CODE')
    const supplemental = codeFiles
        .filter((f) => f.fileType === 'SUPPLEMENTAL-CODE')
        .sort((a, b) => a.name.localeCompare(b.name))
    return [...main, ...supplemental].map((f) => ({ name: f.name, fileType: f.fileType }))
}
