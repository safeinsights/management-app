import type { StudyJobStatus, StudyStatus } from '@/database/types'

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

export type MinimalJobInfo = { memberIdentifier: string; studyId: string; studyJobId: string }
export type MinimalJobResultsInfo = { resultsPath: string } & MinimalJobInfo

export type AllStatus = StudyJobStatus | StudyStatus
