import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { CODER_DISABLED, DEV_ENV, getConfigValue } from '@/server/config'

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

    // Idempotent: skip when files already exist so the late copy doesn't clobber user edits.
    if (await devDirHasFiles(coderFilesPath)) return

    const { fetchLatestCodeEnvForStudyId } = await import('@/server/db/queries')
    const { fetchFileContents } = await import('@/server/storage')
    const { pathForStarterCode } = await import('@/lib/paths')

    const codeEnv = await fetchLatestCodeEnvForStudyId(studyId)
    await fs.mkdir(coderFilesPath, { recursive: true })

    // Backdate mtime so starter files appear as "unchanged" relative to the baseline job
    const pastDate = new Date(Date.now() - 60_000)

    for (const fileName of codeEnv.starterCodeFileNames) {
        const s3Path = pathForStarterCode({ orgSlug: codeEnv.slug, codeEnvId: codeEnv.id, fileName })
        const fileData = await fetchFileContents(s3Path)
        const targetPath = `${coderFilesPath}/${fileName}`
        await fs.mkdir(path.dirname(targetPath), { recursive: true })
        await fs.writeFile(targetPath, Buffer.from(await fileData.arrayBuffer()))
        await fs.utimes(targetPath, pastDate, pastDate)
    }
}
