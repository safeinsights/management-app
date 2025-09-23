import type { FileType, StudyJobStatus, StudyStatus, OrgType } from '../database/types'
import { z } from 'zod'
import { FileEntry } from 'si-encryption/job-results/types'
import type { ActionResponse } from '@/lib/errors'

export type UserOrgRoles = { isAdmin: boolean }

export type UUID = string

// Settings types for different org types
export type EnclaveSettings = {
    publicKey: string
}

export type LabSettings = Record<string, never> // Empty object for now, can be extended later

// Discriminated union types for organizations
export type EnclaveOrg = {
    type: 'enclave'
    settings: EnclaveSettings
}

export type LabOrg = {
    type: 'lab'
    settings: LabSettings
}

// Type guards
export function isEnclaveOrg(org: { type: OrgType }): org is EnclaveOrg {
    return org.type === 'enclave'
}

export function isLabOrg(org: { type: OrgType }): org is LabOrg {
    return org.type === 'lab'
}

export type SessionUser = {
    id: string
    isSiAdmin: boolean
    clerkUserId: string
}

export type Org = UserOrgRoles & {
    id: string
    type: OrgType
    slug: string
}

export type UserSession = {
    user: SessionUser
    org: Org
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

export const JOB_FINAL_STATUSES: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

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
export type ActionResult<T extends (...args: any) => any> = Awaited<ReturnType<T>>

// Helper to extract success data type from ActionResponse (excluding error case)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionSuccessType<T extends (...args: any) => any> =
    ActionResult<T> extends ActionResponse<infer U> ? U : never

export type JobFileInfo = FileEntry & {
    sourceId: string
    fileType: FileType
}

export type JobFile = {
    contents: ArrayBuffer
    path: string
    fileType: FileType
}

// use as: IsUnknown<Args> extends true
export type IsUnknown<T> = unknown extends T ? (T extends unknown ? true : false) : false

export const BLANK_SESSION: UserSession = {
    user: { id: '', isSiAdmin: false, clerkUserId: '' },
    org: { id: '', type: 'enclave', slug: '', isAdmin: false },
}

Object.freeze(BLANK_SESSION)

// Import the unified ActionResponse type from errors
export type { ActionResponse } from '@/lib/errors'

export type StudyStage = 'Proposal' | 'Code' | 'Results'
