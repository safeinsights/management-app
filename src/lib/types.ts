import type { StudyRunStatus, StudyStatus } from '../database/types'

export class AccessDeniedError extends Error {}

export type User = {
    id: string
    email: string
    roles: string[]
}

export type Member = {
    id: string
    name: string
    identifier: string
    publicKey: string
    email: string
}

export type TreeNode = {
    label: string
    value: string
    size: number
    children?: TreeNode[]
}

export type CodeManifest = {
    files: Record<string, number>
    tree: TreeNode
    size: number
}

export type MinimalRunInfo = { memberIdentifier: string; studyId: string; studyRunId: string }
export type MinimalRunResultsInfo = { resultsPath: string } & MinimalRunInfo

export type AllStatus = StudyRunStatus | StudyStatus
