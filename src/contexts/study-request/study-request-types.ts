import type { UseFormReturnType } from '@mantine/form'
import type { DocumentFileState } from '@/contexts/shared/file-types'
import type { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/form-schemas'
import type { Language, StudyStatus } from '@/database/types'

export type { StudyProposalFormValues }

export interface DraftStudyData {
    id: string
    orgSlug: string
    language: Language | null
    /**
     * Persisted status. Drives the post-submission read-only title on the Set Up page, so it must
     * come from the study row rather than from anything client-side (OTTER-690).
     */
    status?: StudyStatus
    /** Display name of the Data Partner, shown once the selection is locked. */
    orgName?: string
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
    isStep1Valid: boolean
    documentFiles: DocumentFileState
    setStudyId: (id: string) => void
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
}

export const initialFormValues: StudyProposalFormValues = {
    title: '',
    piName: '',
    orgSlug: '',
    language: null,
    mainCodeFile: null,
    additionalCodeFiles: [],
    stepIndex: 0,
    createdStudyId: null,
    ideMainFile: '',
    ideFiles: [],
}

export const initialDocumentFilesState: DocumentFileState = {
    description: null,
    irb: null,
    agreement: null,
}
