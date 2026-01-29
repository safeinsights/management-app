import type { UseFormReturnType } from '@mantine/form'
import type { Language } from '@/database/types'
import type { CodeFileState, DocumentFileState } from '@/contexts/shared/file-types'
import type { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/step1-schema'

export type { StudyProposalFormValues }

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

export interface ExistingFiles {
    descriptionDocPath?: string | null
    irbDocPath?: string | null
    agreementDocPath?: string | null
}

export interface MutationOptions {
    onSuccess?: (data: { studyId: string }) => void
    onError?: (error: Error) => void
}

export interface StudyRequestContextValue {
    studyId: string | null
    orgSlug: string
    submittingOrgSlug: string
    form: UseFormReturnType<StudyProposalFormValues>
    existingFiles: ExistingFiles | undefined
    isFormValid: boolean
    codeFiles: CodeFileState
    codeFilesLastUpdated: Date | null
    codeSource: 'upload' | 'ide'
    codeUploadViewMode: 'upload' | 'review'
    canProceedToReview: boolean
    documentFiles: DocumentFileState
    mainFileName: string | null
    additionalFileNames: string[]
    canSubmit: boolean
    setStudyId: (id: string) => void
    setCodeFiles: (main: File | null, additional: File[]) => void
    setIDECodeFiles: (mainFileName: string, fileNames: string[]) => void
    setMainCodeFile: (fileName: string) => void
    removeCodeFile: (fileName: string) => void
    clearCodeFiles: () => void
    setCodeUploadViewMode: (mode: 'upload' | 'review') => void
    setDocumentFile: (type: 'description' | 'irb' | 'agreement', file: File) => void
    setExistingDocuments: (docs: {
        description?: string | null
        irb?: string | null
        agreement?: string | null
    }) => void
    initFromDraft: (draft: DraftStudyData, submittingOrgSlug: string) => void
    reset: (studyId?: string) => void
    saveDraft: (options?: MutationOptions) => void
    isSaving: boolean

    submitStudy: () => void
    isSubmitting: boolean
}

export const initialFormValues: StudyProposalFormValues = {
    title: '',
    piName: '',
    orgSlug: '',
    language: 'R',
    descriptionDocument: null,
    irbDocument: null,
    agreementDocument: null,
    mainCodeFile: null,
    additionalCodeFiles: [],
    stepIndex: 0,
    createdStudyId: null,
    ideMainFile: '',
    ideFiles: [],
}

export const initialCodeFilesState: CodeFileState = {
    mainFile: null,
    additionalFiles: [],
}

export const initialDocumentFilesState: DocumentFileState = {
    description: null,
    irb: null,
    agreement: null,
}
