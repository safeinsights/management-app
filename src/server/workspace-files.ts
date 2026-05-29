import { pathForStarterCode } from '@/lib/paths'
import logger from '@/lib/logger'
import { getConfigValue } from './config'
import { fetchLatestCodeEnvForStudyId } from './db/queries'
import { latestStudyJobCreatedAt } from './db/mutations'
import { db } from '@/database'
import { fetchFileContents } from './storage'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { errorToString, isActionError } from '@/lib/errors'
import { ContextName, getAgentContext } from '@/lib/agent-context'
import * as database from '@/database'
import { generateDataSourcesContextString } from '@/server/utils'

async function studyDirHasFiles(dir: string): Promise<boolean> {
    try {
        const entries = await fs.readdir(dir)
        return entries.some((e) => !e.startsWith('.'))
    } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return false
        throw e
    }
}

export const initializeWorkspaceCodeFiles = async (studyId: string): Promise<void> => {
    const coderBaseFilePath = await getConfigValue('CODER_FILES')
    const studyDir = path.join(coderBaseFilePath, studyId)

    // Idempotent: only copy starter files when the directory is empty.
    // Skips repeat calls (ready-polling) and avoids clobbering user edits across sessions.
    if (await studyDirHasFiles(studyDir)) return

    const codeEnv = await fetchLatestCodeEnvForStudyId(studyId)

    logger.info(`Initializing workspace with starter code for study ${studyId} ...`)

    // Backdate starter-file mtime relative to the baseline studyJob rather than wall-clock.
    // Wall-clock backdating breaks when provisioning takes longer than the backdate window:
    // files end up newer than the baseline and the "files changed" gate flips Submit on without
    // any user edits. Falling back to wall-clock is only for the (currently impossible) case of
    // no baseline existing.
    const baselineCreatedAt = await latestStudyJobCreatedAt(db, studyId)
    const pastDate = baselineCreatedAt ? new Date(baselineCreatedAt.getTime() - 1000) : new Date(Date.now() - 60_000)

    for (const fileName of codeEnv.starterCodeFileNames) {
        const filePath = pathForStarterCode({ orgSlug: codeEnv.slug, codeEnvId: codeEnv.id, fileName })
        const fileData = await fetchFileContents(filePath)
        const targetFilePath = path.join(studyDir, fileName)

        logger.info(`Writing ${fileName} to ${targetFilePath} for study ${studyId}`)

        await fs.mkdir(path.dirname(targetFilePath), { recursive: true })
        await fs.writeFile(targetFilePath, Buffer.from(await fileData.arrayBuffer()))
        await fs.utimes(targetFilePath, pastDate, pastDate)
    }

    // Initialize claude.md
    // FYI: claude.md is only populated on workspace init. New updates to context after
    // a workspace has been launched will not propagate.
    const workspaceContexts: ContextName[] = ['SYSTEM', codeEnv.language]

    let combinedContextString = ''
    for (const contextName of workspaceContexts) {
        const response = await getAgentContext(database.db, { name: contextName, orgId: null })
        if (isActionError(response)) {
            throw new Error(errorToString(response))
        }
        if (response.content) combinedContextString += response.content + '\n'
    }

    combinedContextString += await generateDataSourcesContextString(codeEnv.orgId)

    const targetContextFileName = 'CLAUDE.md'
    const targetContextPath = path.join(coderBaseFilePath, studyId, targetContextFileName)

    logger.info(`Writing ${targetContextFileName} to ${targetContextPath} for study ${studyId}`)

    await fs.mkdir(path.dirname(targetContextPath), { recursive: true })
    await fs.writeFile(targetContextPath, combinedContextString, 'utf-8')
    await fs.utimes(targetContextPath, pastDate, pastDate)
}
