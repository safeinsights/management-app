import type { StudyJobStatus, StudyStatus } from '@/database/types'
import { z } from 'zod'

export type User = {
    id: string
    email: string
    roles: string[]
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

export type UserOrgRoles = { isAdmin: boolean; isResearcher: boolean; isReviewer: boolean }

export enum AuthRole {
    Admin = 'admin',
    Reviewer = 'reviewer',
    Researcher = 'researcher',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionReturnType<T extends (...args: any) => any> = Awaited<ReturnType<T>>
