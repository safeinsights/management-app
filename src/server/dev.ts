import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { CODER_DISABLED, DEV_ENV, getConfigValue } from '@/server/config'
import { fetchLatestCodeEnvForStudyId, fetchLatestCodeEnvForStudyIdOrNull } from '@/server/db/queries'
import { fetchFileContents } from '@/server/storage'
import { latestStudyJobCreatedAt } from '@/server/db/mutations'
import { writeAgentContext } from '@/server/context-writer'
import { pathForStarterCode } from '@/lib/paths'
import { templateFileNameFor } from '@/lib/languages'
import { db, type DBExecutor } from '@/database'

export async function cleanupCoderDevFiles() {
    if (!DEV_ENV || !CODER_DISABLED) return

    const coderFilesPath = await getConfigValue('CODER_FILES')
    await fs.rm(coderFilesPath, { recursive: true, force: true })
    await fs.mkdir(coderFilesPath, { recursive: true })
}

async function devDirHasFiles(dir: string): Promise<boolean> {
    try {
        const entries = await fs.readdir(dir)
        return entries.some((e) => !e.startsWith('.'))
    } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return false
        throw e
    }
}

/**
 * The CODER_DISABLED counterpart of copyStarterCodeIntoWorkspace. Takes an executor so a caller
 * already inside a transaction does not wait on the pool for a second connection.
 */
export async function copyStarterCodeIntoDevWorkspace(
    studyId: string,
    executor: DBExecutor = db,
): Promise<string | null> {
    if (!CODER_DISABLED) return null

    const coderFilesPath = await getConfigValue('CODER_FILES')
    const codeEnv = await fetchLatestCodeEnvForStudyIdOrNull(studyId)
    if (!codeEnv || codeEnv.starterCodeFileNames.length === 0) return null

    await fs.mkdir(coderFilesPath, { recursive: true })

    // Backdated against the baseline studyJob, not wall-clock; see initializeWorkspaceCodeFiles.
    const baselineCreatedAt = await latestStudyJobCreatedAt(executor, studyId)
    const pastDate = baselineCreatedAt ? new Date(baselineCreatedAt.getTime() - 1000) : new Date(Date.now() - 60_000)

    // First starter file becomes Main.{x}; see copyStarterCodeIntoWorkspace.
    const templateName = templateFileNameFor(codeEnv.language)

    // Skip when files already exist, so a late copy does not clobber user edits.
    if (await devDirHasFiles(coderFilesPath)) return null

    for (const [index, fileName] of codeEnv.starterCodeFileNames.entries()) {
        const s3Path = pathForStarterCode({ orgSlug: codeEnv.slug, codeEnvId: codeEnv.id, fileName })
        const fileData = await fetchFileContents(s3Path)
        const targetPath = `${coderFilesPath}/${index === 0 ? templateName : fileName}`
        await fs.mkdir(path.dirname(targetPath), { recursive: true })
        await fs.writeFile(targetPath, Buffer.from(await fileData.arrayBuffer()))
        await fs.utimes(targetPath, pastDate, pastDate)
    }

    return templateName
}

export async function initializeDevWorkspaceFiles(studyId: string) {
    if (!CODER_DISABLED) return

    const coderFilesPath = await getConfigValue('CODER_FILES')

    await copyStarterCodeIntoDevWorkspace(studyId)

    const codeEnv = await fetchLatestCodeEnvForStudyId(studyId)
    const baselineCreatedAt = await latestStudyJobCreatedAt(db, studyId)
    const pastDate = baselineCreatedAt ? new Date(baselineCreatedAt.getTime() - 1000) : new Date(Date.now() - 60_000)

    await writeAgentContext({
        targetDir: coderFilesPath,
        language: codeEnv.language,
        orgId: codeEnv.orgId,
        pastDate,
        logCtx: `[dev-init study=${studyId}]`,
    })
}
