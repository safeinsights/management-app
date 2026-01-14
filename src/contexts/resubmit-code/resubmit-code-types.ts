import type { Language } from '@/database/types'

export type ResubmitViewMode = 'upload' | 'import-ide' | 'review'

export interface ResubmitStudyData {
    id: string
    orgSlug: string
    submittedByOrgSlug: string
    language: Language
}

export interface ResubmitCodeContextValue {
    studyId: string
    orgSlug: string
    submittingOrgSlug: string
    language: Language

    viewMode: ResubmitViewMode
    setViewMode: (mode: ResubmitViewMode) => void
    goToUpload: () => void
    goToReview: () => void
    goToImportIDE: () => void

    uploadedFiles: File[]
    uploadMainFile: string | null
    uploadLastModified: string | null
    canSubmitUpload: boolean
    setUploadedFiles: (files: File[], mainFileName: string) => void
    setUploadMainFile: (fileName: string) => void
    removeUploadedFile: (fileName: string) => void

    filteredIdeFiles: string[]
    currentIdeMainFile: string
    hasImportedFromIDE: boolean
    lastModified: string | null
    showEmptyState: boolean
    isLoadingFiles: boolean
    canSubmitFromIDE: boolean
    setIdeMainFile: (fileName: string) => void
    removeIdeFile: (fileName: string) => void
    handleImportFiles: () => void

    isIDELoading: boolean
    ideLoadingMessage: string
    launchError: Error | null
    launchWorkspace: () => void

    resubmitStudy: () => void
    isPending: boolean
}
