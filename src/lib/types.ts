import type { FileType, StudyJobStatus, StudyStatus } from '@/database/types'
import { z } from 'zod'
import { FileEntry } from 'si-encryption/job-results/types'

export type  UserOrgRoles= { isAdmin: boolean; isResearcher: boolean; isReviewer: boolean }

export type User = {
    id: string
    email: string
}

export type Team = {
    id: string
    name: string
}


export type UserTeam = UserOrgRoles & {
    userId: string
    teamId: string
}

export type Session = {
    user: User
    team: Team
    roles: UserOrgRoles
}

export type TreeNode = {
    label: string
    value: string
    size: number
    children?: TreeNode[]
}

// only R for now
export type SupportedLanguages = 'r'
export type CodeManifestFileInfo = {
    size: number
    contentType: string
}

// this is the manifest that's generated when a user uploads code
// it's used to display the code in the UI for review
// and stored alongside the code in s3
export type CodeManifest = {
    jobId: string
    language: SupportedLanguages
    files: Record<string, CodeManifestFileInfo> // path -> size
    tree: TreeNode
    size: number
}

export enum StudyDocumentType {
    'IRB' = 'IRB',
    'DESCRIPTION' = 'DESCRIPTION',
    'AGREEMENT' = 'AGREEMENT',
}
export const ACCEPTED_FILE_TYPES = {
    'application/x-r': ['.r', '.R'],
    'text/x-r': ['.r', '.R'],
    'text/markdown': ['.rmd'],
    'application/json': ['.json'],
    'text/csv': ['.csv'],
    'text/plain': ['.txt'],
    'application/x-python': ['.py'],
    'application/x-ipynb': ['.ipynb'],
}

export const ACCEPTED_FILE_FORMATS_TEXT = 'Accepted formats: .r, .rmd, .json, .csv, .txt, .py, .ipynb.'

export const minimalStudyInfoSchema = z.object({
    orgSlug: z.string(),
    studyId: z.string(),
})
export type MinimalStudyInfo = z.infer<typeof minimalStudyInfoSchema>

export const minimalJobInfoSchema = minimalStudyInfoSchema.extend({
    studyJobId: z.string(),
})
export type MinimalJobInfo = z.infer<typeof minimalJobInfoSchema>

export type AllStatus = StudyJobStatus | StudyStatus

export const CLERK_ADMIN_ORG_SLUG = 'safe-insights' as const

// inactivity timeout and warning threshold for user sessions
export const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000 // 20 minutes
export const WARNING_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes


export enum AuthRole {
    Admin = 'admin',
    Reviewer = 'reviewer',
    Researcher = 'researcher',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionReturnType<T extends (...args: any) => any> = Awaited<ReturnType<T>>

export type JobFileInfo = FileEntry & {
    sourceId: string
    fileType: FileType
}

export type JobFile = {
    contents: ArrayBuffer
    path: string
    fileType: FileType
}
