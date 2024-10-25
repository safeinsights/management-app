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

export type CodeFileMinimalRun = { studyId: string; id: string }
