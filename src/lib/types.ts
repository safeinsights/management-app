import type { ActionResponse } from '@/lib/errors'
import { FileEntry } from 'si-encryption/job-results/types'
import { z } from 'zod'
import type { FileType, Language, OrgType, StudyJobStatus, StudyStatus } from '../database/types'

export type UserOrgRoles = { isAdmin: boolean }

export type UUID = string

export type EnclaveSettings = {
    publicKey: string
}

export type LabSettings = Record<string, never>

export type EnclaveOrg = {
    type: 'enclave'
    settings: EnclaveSettings
}

export type LabOrg = {
    type: 'lab'
    settings: LabSettings
}

export function isOrgAdmin(org: { isAdmin: boolean }) {
    return org.isAdmin == true
}

export function isEnclaveOrg(org: { type: OrgType }): org is EnclaveOrg {
    return org.type === 'enclave'
}

export function isLabOrg(org: { type: OrgType }): org is LabOrg {
    return org.type === 'lab'
}

export function getLabOrg(session: UserSession): Org | null {
    return Object.values(session.orgs).find(isLabOrg) || null
}

export function getEnclaveOrg(session: UserSession): Org | null {
    return Object.values(session.orgs).find(isEnclaveOrg) || null
}

export function getAdminOrg(session: UserSession): Org | null {
    return Object.values(session.orgs).find(isOrgAdmin) || null
}

export function getOrgBySlug(session: UserSession, slug: string): Org | null {
    return Object.values(session.orgs).find((org) => org.slug === slug) || null
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
    orgs: Record<string, Org>
}

export type TreeNode = {
    label: string
    value: string
    size: number
    children?: TreeNode[]
}

export type SupportedLanguages = 'r' | 'python'
export type CodeManifestFileInfo = {
    size: number
    contentType: string
}

// Generated when a user uploads code, and stored alongside the code in s3.
export type CodeManifest = {
    jobId: string
    language: SupportedLanguages
    files: Record<string, CodeManifestFileInfo>
    tree: TreeNode
    size: number
}

export enum StudyDocumentType {
    IRB = 'IRB',
    DESCRIPTION = 'DESCRIPTION',
    AGREEMENT = 'AGREEMENT',
}
export const ACCEPTED_LANGUAGE_FILE_TYPES: Record<Language, Record<string, string[]>> = {
    R: {
        'application/x-r': ['.r', '.R'],
        'text/x-r': ['.r', '.R'],
        'text/markdown': ['.rmd'],
        'text/x-rmd': ['.rmd'],
    },
    PYTHON: {
        'text/x-python': ['.py'],
        'application/x-python-code': ['.py'],
        'text/x-python-script': ['.py'],
        'application/x-ipynb+json': ['.ipynb'],
    },
}

export const ACCEPTED_FILE_TYPES = {
    ...ACCEPTED_LANGUAGE_FILE_TYPES['R'],
    ...ACCEPTED_LANGUAGE_FILE_TYPES['PYTHON'],
    'application/json': ['.json', '.ipynb'],
    'text/csv': ['.csv'],
    'application/vnd.ms-excel': ['.csv'],
    'text/plain': ['.txt', '.py', '.r', '.R', '.rmd', '.csv'],
}

export const ACCEPTED_FILE_FORMATS_TEXT = 'Accepted formats: .r, .rmd, .json, .csv, .txt, .py, .ipynb.'

export const minimalOrgInfoSchema = z.object({
    orgSlug: z.string(),
})

export type MinimalOrgInfo = z.infer<typeof minimalOrgInfoSchema>

export const minimalStudyInfoSchema = minimalOrgInfoSchema.extend({
    studyId: z.string(),
})

export type MinimalStudyInfo = z.infer<typeof minimalStudyInfoSchema>

export const minimalJobInfoSchema = minimalStudyInfoSchema.extend({
    studyJobId: z.string(),
})

export type MinimalJobInfo = z.infer<typeof minimalJobInfoSchema>

export const minimalCodeEnvInfoSchema = minimalOrgInfoSchema.extend({
    codeEnvId: z.string(),
})

export type MinimalCodeEnvInfo = z.infer<typeof minimalCodeEnvInfoSchema>

export const DATA_SOURCE_TYPES = {
    parquet: 'Parquet',
    avro: 'Avro',
    postgres: 'PostgreSQL',
    csv: 'CSV',
    athena: 'Athena',
} as const

export type DataSourceType = keyof typeof DATA_SOURCE_TYPES

export type AllStatus = StudyJobStatus | StudyStatus

export const JOB_FINAL_STATUSES: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

export const CLERK_ADMIN_ORG_SLUG = 'safe-insights' as const

export const INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000
export const WARNING_THRESHOLD_MS = 10 * 60 * 1000

export enum AuthRole {
    Admin = 'admin',
    Reviewer = 'reviewer',
    Researcher = 'researcher',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionResult<T extends (...args: any) => any> = Awaited<ReturnType<T>>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionSuccessType<T extends (...args: any) => any> =
    ActionResult<T> extends ActionResponse<infer U> ? U : never

const FILE_TYPES = [
    'APPROVED-CODE-RUN-LOG',
    'APPROVED-PACKAGING-ERROR-LOG',
    'APPROVED-RESULT',
    'APPROVED-SECURITY-SCAN-LOG',
    'ENCRYPTED-CODE-RUN-LOG',
    'ENCRYPTED-PACKAGING-ERROR-LOG',
    'ENCRYPTED-RESULT',
    'ENCRYPTED-SECURITY-SCAN-LOG',
    'MAIN-CODE',
    'PACKAGING-ERROR-LOG',
    'SECURITY-SCAN-LOG',
    'SUPPLEMENTAL-CODE',
] as const satisfies readonly FileType[]

export const fileTypeSchema = z.enum(FILE_TYPES)

export const sharedFileKeySchema = z.object({ fingerprint: z.string(), crypt: z.string() })
export const sharedFileSchema = z.object({
    studyJobFileId: z.string(),
    // the inner file within the archive; one AES key per inner file
    filePath: z.string(),
    keys: z.array(sharedFileKeySchema),
})
export type SharedFile = z.infer<typeof sharedFileSchema>

export type JobFileInfo = FileEntry & {
    sourceId: string
    fileType: FileType
    // SECURITY: unlocks the file body. Kept in-memory for the client-side re-wrap at approve time
    // and must never be sent to the server or persisted.
    rawAesKey?: ArrayBuffer
}

export type JobFile = {
    contents: ArrayBuffer
    path: string
    fileType: FileType
}

export type IsUnknown<T> = unknown extends T ? (T extends unknown ? true : false) : false

export const BLANK_SESSION: UserSession = {
    user: { id: '', isSiAdmin: false, clerkUserId: '' },
    orgs: {},
}

Object.freeze(BLANK_SESSION)

export type { ActionResponse } from '@/lib/errors'

export type StudyStage = 'Proposal' | 'Code' | 'Results'
