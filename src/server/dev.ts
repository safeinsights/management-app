import { CODER_DISABLED } from '@/server/config'
import { copyStarterCodeIntoWorkspace, initializeWorkspaceCodeFiles } from '@/server/coder/workspaces'
import { type DBExecutor } from '@/database'

export async function copyStarterCodeIntoDevWorkspace(studyId: string, executor: DBExecutor): Promise<string | null> {
    if (!CODER_DISABLED) return null
    return copyStarterCodeIntoWorkspace(studyId, executor)
}

export async function initializeDevWorkspaceFiles(studyId: string) {
    if (!CODER_DISABLED) return
    await initializeWorkspaceCodeFiles(studyId)
}
