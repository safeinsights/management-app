import { create } from 'zustand'
import { Language } from '@/database/types'

interface MemoryFile {
    type: 'memory'
    file: File
}

interface ServerFile {
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

export interface DraftStudyData {
    id: string
    orgSlug: string
    language: Language | null
    title?: string
    piName?: string
    descriptionDocPath?: string | null
    irbDocPath?: string | null
    agreementDocPath?: string | null
    mainCodeFileName?: string | null
    additionalCodeFileNames?: string[]
}

interface StudyRequestState {
    studyId: string | null
    orgSlug: string
    submittingOrgSlug: string
    language: Language | null
    codeFiles: CodeFileState
    documentFiles: DocumentFileState
    codeUploadViewMode: 'upload' | 'review'

    setStudyId: (id: string) => void
    setOrgSlug: (slug: string) => void
    setSubmittingOrgSlug: (slug: string) => void
    setLanguage: (lang: Language | null) => void
    setCodeFiles: (main: File | null, additional: File[]) => void
    setMainCodeFile: (fileName: string) => void
    removeCodeFile: (fileName: string) => void
    clearCodeFiles: () => void
    setDocumentFile: (type: 'description' | 'irb' | 'agreement', file: File) => void
    setExistingDocuments: (docs: { description?: string | null; irb?: string | null; agreement?: string | null }) => void
    setCodeUploadViewMode: (mode: 'upload' | 'review') => void
    initFromDraft: (draft: DraftStudyData, submittingOrgSlug: string) => void
    reset: () => void
}

const getFileName = (f: FileRef): string => (f.type === 'memory' ? f.file.name : f.name)

const pathToServerFile = (path: string | null | undefined): ServerFile | null => {
    if (!path) return null
    const name = path.split('/').pop() || path
    return { type: 'server', path, name }
}

const initialState = {
    studyId: null as string | null,
    orgSlug: '',
    submittingOrgSlug: '',
    language: null as Language | null,
    codeFiles: { mainFile: null, additionalFiles: [] } as CodeFileState,
    documentFiles: { description: null, irb: null, agreement: null } as DocumentFileState,
    codeUploadViewMode: 'upload' as const,
}

export const useStudyRequestStore = create<StudyRequestState>((set, get) => ({
    ...initialState,

    setStudyId: (id) => set({ studyId: id }),
    setOrgSlug: (slug) => set({ orgSlug: slug }),
    setSubmittingOrgSlug: (slug) => set({ submittingOrgSlug: slug }),
    setLanguage: (lang) => set({ language: lang }),

    setCodeFiles: (main, additional) =>
        set({
            codeFiles: {
                mainFile: main ? { type: 'memory', file: main } : null,
                additionalFiles: additional.map((f) => ({ type: 'memory', file: f })),
            },
        }),

    setMainCodeFile: (fileName) => {
        const { codeFiles } = get()
        const allFiles = [codeFiles.mainFile, ...codeFiles.additionalFiles].filter(Boolean) as FileRef[]
        const newMain = allFiles.find((f) => getFileName(f) === fileName)
        if (newMain) {
            const others = allFiles.filter((f) => f !== newMain)
            set({ codeFiles: { mainFile: newMain, additionalFiles: others } })
        }
    },

    removeCodeFile: (fileName) => {
        const { codeFiles } = get()
        if (codeFiles.mainFile && getFileName(codeFiles.mainFile) === fileName) {
            const [newMain, ...rest] = codeFiles.additionalFiles
            set({ codeFiles: { mainFile: newMain || null, additionalFiles: rest } })
        } else {
            set({
                codeFiles: {
                    ...codeFiles,
                    additionalFiles: codeFiles.additionalFiles.filter((f) => getFileName(f) !== fileName),
                },
            })
        }
    },

    clearCodeFiles: () => set({ codeFiles: { mainFile: null, additionalFiles: [] } }),

    setDocumentFile: (type, file) =>
        set((state) => ({
            documentFiles: {
                ...state.documentFiles,
                [type]: { type: 'memory', file } as MemoryFile,
            },
        })),

    setExistingDocuments: (docs) =>
        set((state) => ({
            documentFiles: {
                description: pathToServerFile(docs.description) ?? state.documentFiles.description,
                irb: pathToServerFile(docs.irb) ?? state.documentFiles.irb,
                agreement: pathToServerFile(docs.agreement) ?? state.documentFiles.agreement,
            },
        })),

    setCodeUploadViewMode: (mode) => set({ codeUploadViewMode: mode }),

    initFromDraft: (draft, submittingOrgSlug) =>
        set({
            studyId: draft.id,
            orgSlug: draft.orgSlug,
            submittingOrgSlug,
            language: draft.language,
            documentFiles: {
                description: pathToServerFile(draft.descriptionDocPath),
                irb: pathToServerFile(draft.irbDocPath),
                agreement: pathToServerFile(draft.agreementDocPath),
            },
            codeFiles: {
                mainFile: draft.mainCodeFileName ? { type: 'server', path: '', name: draft.mainCodeFileName } : null,
                additionalFiles: (draft.additionalCodeFileNames || []).map((name) => ({
                    type: 'server' as const,
                    path: '',
                    name,
                })),
            },
        }),

    reset: () => set(initialState),
}))

export const useStudyId = () => useStudyRequestStore((state) => state.studyId)
export const useCodeFiles = () => useStudyRequestStore((state) => state.codeFiles)
export const useDocumentFiles = () => useStudyRequestStore((state) => state.documentFiles)
export const useCodeUploadViewMode = () => useStudyRequestStore((state) => state.codeUploadViewMode)
export const useCanProceedToReview = () => useStudyRequestStore((state) => state.codeFiles.mainFile !== null)

export const getFileFromRef = (ref: FileRef | null): File | null => {
    if (!ref) return null
    return ref.type === 'memory' ? ref.file : null
}

export const getCodeFilesForUpload = (codeFiles: CodeFileState): { main: File | null; additional: File[] } => {
    const main = codeFiles.mainFile?.type === 'memory' ? codeFiles.mainFile.file : null
    const additional = codeFiles.additionalFiles
        .filter((f): f is MemoryFile => f.type === 'memory')
        .map((f) => f.file)
    return { main, additional }
}

export const hasNewCodeFiles = (codeFiles: CodeFileState): boolean => {
    return codeFiles.mainFile?.type === 'memory' || codeFiles.additionalFiles.some((f) => f.type === 'memory')
}
