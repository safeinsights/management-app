import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { CODER_DISABLED, DEV_ENV, getConfigValue } from '@/server/config'
import { fetchLatestCodeEnvForStudyId } from '@/server/db/queries'
import { fetchFileContents } from '@/server/storage'
import { latestStudyJobCreatedAt } from '@/server/db/mutations'
import { writeAgentContext } from '@/server/context-writer'
import { pathForStarterCode } from '@/lib/paths'
import { db } from '@/database'

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

export async function initializeDevWorkspaceFiles(studyId: string) {
    if (!CODER_DISABLED) return

    const coderFilesPath = await getConfigValue('CODER_FILES')

    const codeEnv = await fetchLatestCodeEnvForStudyId(studyId)
    await fs.mkdir(coderFilesPath, { recursive: true })

    // Backdate file mtimes relative to the baseline studyJob rather than wall-clock.
    // See workspaces.ts:initializeWorkspaceCodeFiles for the same reasoning.
    const baselineCreatedAt = await latestStudyJobCreatedAt(db, studyId)
    const pastDate = baselineCreatedAt ? new Date(baselineCreatedAt.getTime() - 1000) : new Date(Date.now() - 60_000)

    // Idempotent: skip when files already exist so the late copy doesn't clobber user edits.
    if (!(await devDirHasFiles(coderFilesPath))) {
        for (const fileName of codeEnv.starterCodeFileNames) {
            const s3Path = pathForStarterCode({ orgSlug: codeEnv.slug, codeEnvId: codeEnv.id, fileName })
            const fileData = await fetchFileContents(s3Path)
            const targetPath = `${coderFilesPath}/${fileName}`
            await fs.mkdir(path.dirname(targetPath), { recursive: true })
            await fs.writeFile(targetPath, Buffer.from(await fileData.arrayBuffer()))
            await fs.utimes(targetPath, pastDate, pastDate)
        }
    }

    // Refresh CLAUDE.md from the latest context on every launch (preserving manual user edits).
    await writeAgentContext({
        targetDir: coderFilesPath,
        language: codeEnv.language,
        orgId: codeEnv.orgId,
        pastDate,
        logCtx: `[dev-init study=${studyId}]`,
    })
}
