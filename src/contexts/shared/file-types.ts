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

export interface DocumentFileState {
    description: FileRef | null
    irb: FileRef | null
    agreement: FileRef | null
}

export const getFileName = (f: FileRef): string => (f.type === 'memory' ? f.file.name : f.name)

export const pathToServerFile = (path: string | null | undefined): ServerFile | null => {
    if (!path) return null
    const name = path.split('/').pop() || path
    return { type: 'server', path, name }
}

export const getFileFromRef = (ref: FileRef | null): File | null => {
    if (!ref) return null
    return ref.type === 'memory' ? ref.file : null
}

export const toMemoryFile = (file: File): MemoryFile => ({ type: 'memory', file })
