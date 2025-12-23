/**
 * Shared file reference types for study request and resubmit flows.
 * FileRef represents either a file in browser memory or a file already on the server.
 */

export interface MemoryFile {
    type: 'memory'
    file: File
}

export interface ServerFile {
    type: 'server'
    path: string
    name: string
}

export type FileRef = MemoryFile | ServerFile

export interface CodeFileState {
    mainFile: FileRef | null
    additionalFiles: FileRef[]
}

export interface DocumentFileState {
    description: FileRef | null
    irb: FileRef | null
    agreement: FileRef | null
}

// Utility functions

export const getFileName = (f: FileRef): string => (f.type === 'memory' ? f.file.name : f.name)

export const getFileSize = (f: FileRef): number => (f.type === 'memory' ? f.file.size : 0)

export const pathToServerFile = (path: string | null | undefined): ServerFile | null => {
    if (!path) return null
    const name = path.split('/').pop() || path
    return { type: 'server', path, name }
}

export const getFileFromRef = (ref: FileRef | null): File | null => {
    if (!ref) return null
    return ref.type === 'memory' ? ref.file : null
}

export const getCodeFilesForUpload = (codeFiles: CodeFileState): { main: File | null; additional: File[] } => {
    const main = codeFiles.mainFile?.type === 'memory' ? codeFiles.mainFile.file : null
    const additional = codeFiles.additionalFiles.filter((f): f is MemoryFile => f.type === 'memory').map((f) => f.file)
    return { main, additional }
}

export const hasNewCodeFiles = (codeFiles: CodeFileState): boolean => {
    return codeFiles.mainFile?.type === 'memory' || codeFiles.additionalFiles.some((f) => f.type === 'memory')
}

export const toMemoryFile = (file: File): MemoryFile => ({ type: 'memory', file })

export const toServerFile = (name: string, path: string = ''): ServerFile => ({ type: 'server', path, name })
