import { create } from 'zustand'
import { Language } from '@/database/types'

export type ResubmitViewMode = 'upload' | 'import-ide' | 'review'

interface ResubmitCodeState {
    // Study info
    studyId: string
    orgSlug: string
    submittingOrgSlug: string
    language: Language

    // View state
    viewMode: ResubmitViewMode

    // Upload flow state
    uploadedFiles: File[]
    uploadMainFile: string | null

    // IDE flow state
    ideMainFile: string
    hasImportedFromIDE: boolean
    removedIdeFiles: Set<string>

    // Actions
    init: (study: { id: string; orgSlug: string; submittedByOrgSlug: string; language: Language }) => void
    reset: () => void

    // View mode actions
    setViewMode: (mode: ResubmitViewMode) => void
    goToUpload: () => void
    goToReview: () => void
    goToImportIDE: () => void

    // Upload flow actions
    setUploadedFiles: (files: File[], mainFileName: string) => void
    setUploadMainFile: (fileName: string) => void
    removeUploadedFile: (fileName: string) => void

    // IDE flow actions
    setIdeMainFile: (fileName: string) => void
    removeIdeFile: (fileName: string) => void
    markAsImported: () => void
    resetIdeImport: () => void
}

const initialState = {
    studyId: '',
    orgSlug: '',
    submittingOrgSlug: '',
    language: 'PYTHON' as Language,
    viewMode: 'upload' as ResubmitViewMode,
    uploadedFiles: [] as File[],
    uploadMainFile: null as string | null,
    ideMainFile: '',
    hasImportedFromIDE: false,
    removedIdeFiles: new Set<string>(),
}

export const useResubmitCodeStore = create<ResubmitCodeState>((set, get) => ({
    ...initialState,

    init: (study) =>
        set({
            ...initialState,
            studyId: study.id,
            orgSlug: study.orgSlug,
            submittingOrgSlug: study.submittedByOrgSlug,
            language: study.language,
            removedIdeFiles: new Set<string>(),
        }),

    reset: () => set({ ...initialState, removedIdeFiles: new Set<string>() }),

    // View mode actions
    setViewMode: (mode) => set({ viewMode: mode }),
    goToUpload: () => set({ viewMode: 'upload' }),
    goToReview: () => set({ viewMode: 'review' }),
    goToImportIDE: () => set({ viewMode: 'import-ide' }),

    // Upload flow actions
    setUploadedFiles: (files, mainFileName) =>
        set({
            uploadedFiles: files,
            uploadMainFile: mainFileName,
        }),

    setUploadMainFile: (fileName) => set({ uploadMainFile: fileName }),

    removeUploadedFile: (fileName) => {
        const { uploadedFiles, uploadMainFile } = get()
        const newFiles = uploadedFiles.filter((f) => f.name !== fileName)
        const newMainFile =
            uploadMainFile === fileName ? (newFiles.length > 0 ? newFiles[0].name : null) : uploadMainFile

        set({
            uploadedFiles: newFiles,
            uploadMainFile: newMainFile,
        })
    },

    // IDE flow actions
    setIdeMainFile: (fileName) => set({ ideMainFile: fileName }),

    removeIdeFile: (fileName) => {
        const { removedIdeFiles, ideMainFile } = get()
        const newRemoved = new Set(removedIdeFiles)
        newRemoved.add(fileName)

        set({
            removedIdeFiles: newRemoved,
            ideMainFile: ideMainFile === fileName ? '' : ideMainFile,
        })
    },

    markAsImported: () =>
        set({
            hasImportedFromIDE: true,
            removedIdeFiles: new Set<string>(),
            ideMainFile: '',
        }),

    resetIdeImport: () =>
        set({
            hasImportedFromIDE: false,
            removedIdeFiles: new Set<string>(),
            ideMainFile: '',
        }),
}))

// Selector hooks
export const useResubmitViewMode = () => useResubmitCodeStore((state) => state.viewMode)
export const useResubmitStudyId = () => useResubmitCodeStore((state) => state.studyId)
export const useResubmitOrgSlug = () => useResubmitCodeStore((state) => state.orgSlug)
export const useResubmitSubmittingOrgSlug = () => useResubmitCodeStore((state) => state.submittingOrgSlug)
export const useResubmitLanguage = () => useResubmitCodeStore((state) => state.language)

// Upload flow selectors
export const useUploadedFiles = () => useResubmitCodeStore((state) => state.uploadedFiles)
export const useUploadMainFile = () => useResubmitCodeStore((state) => state.uploadMainFile)
export const useCanSubmitUpload = () =>
    useResubmitCodeStore((state) => state.uploadMainFile !== null && state.uploadedFiles.length > 0)

// IDE flow selectors
export const useIdeMainFile = () => useResubmitCodeStore((state) => state.ideMainFile)
export const useHasImportedFromIDE = () => useResubmitCodeStore((state) => state.hasImportedFromIDE)
export const useRemovedIdeFiles = () => useResubmitCodeStore((state) => state.removedIdeFiles)

// Computed selector for filtered IDE files (needs workspace data passed in)
export const getFilteredIdeFiles = (workspaceFiles: string[], removedFiles: Set<string>): string[] => {
    return workspaceFiles.filter((f) => !removedFiles.has(f))
}

// Computed selector for current IDE main file
export const getCurrentIdeMainFile = (
    ideMainFile: string,
    suggestedMain: string | undefined,
    filteredFiles: string[],
): string => {
    return ideMainFile || suggestedMain || filteredFiles[0] || ''
}

// IDE submission validation (needs filtered files and current main file passed in)
export const canSubmitIDE = (currentMainFile: string, filteredFiles: string[]): boolean => {
    return currentMainFile !== '' && filteredFiles.length > 0
}

// Payload preparation for upload submission
export interface UploadPayload {
    mainFileName: string
    mainCodeFile: File
    additionalCodeFiles: File[]
}

export const getUploadPayload = (uploadedFiles: File[], uploadMainFile: string | null): UploadPayload | null => {
    if (!uploadMainFile || uploadedFiles.length === 0) return null

    const mainCodeFile = uploadedFiles.find((f) => f.name === uploadMainFile)
    if (!mainCodeFile) return null

    return {
        mainFileName: uploadMainFile,
        mainCodeFile,
        additionalCodeFiles: uploadedFiles.filter((f) => f.name !== uploadMainFile),
    }
}

// Payload preparation for IDE submission
export interface IdePayload {
    mainFileName: string
    fileNames: string[]
}

export const getIdePayload = (currentMainFile: string, filteredFiles: string[]): IdePayload | null => {
    if (!canSubmitIDE(currentMainFile, filteredFiles)) return null

    return {
        mainFileName: currentMainFile,
        fileNames: filteredFiles,
    }
}
