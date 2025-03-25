import type { StudyJobStatus, StudyStatus } from '@/database/types'
import { z } from 'zod'
export class AccessDeniedError extends Error {}

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

export const minimalStudyInfoSchema = z.object({
    memberIdentifier: z.string(),
    studyId: z.string(),
})
export type MinimalStudyInfo = z.infer<typeof minimalStudyInfoSchema>

export const minimalJobInfoShema = minimalStudyInfoSchema.extend({
    studyJobId: z.string(),
})
export type MinimalJobInfo = z.infer<typeof minimalJobInfoShema>

export const minimalJobResultsInfoSchema = minimalJobInfoShema.extend({
    resultsPath: z.string(),
})
export type MinimalJobResultsInfo = z.infer<typeof minimalJobResultsInfoSchema>

export type AllStatus = StudyJobStatus | StudyStatus

export function isMinimalStudyRunInfo(info: MinimalStudyInfo | MinimalJobResultsInfo): info is MinimalJobResultsInfo {
    return 'studyJobId' in info
}
