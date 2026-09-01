import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { db } from '@/database'
import type { Language } from '@/database/types'
import { ContextName, getAgentContext } from '@/lib/agent-context'
import { errorToString, isActionError } from '@/lib/errors'
import { generateDataSourcesContextString } from '@/server/utils'
import logger from '@/lib/logger'

const CONTEXT_FILE_NAME = 'CLAUDE.md'
// Holds the hash of the last generated content, so a user-edited CLAUDE.md is distinguishable.
// Dotfiles are excluded from the file list and the Submit gate, so it stays invisible.
const SENTINEL_FILE_NAME = '.claude-context-hash'

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex')

async function buildContextString(language: Language, orgId: string, logCtx: string): Promise<string> {
    const workspaceContexts: ContextName[] = ['SYSTEM', language]

    let combinedContextString = ''
    for (const contextName of workspaceContexts) {
        let response
        try {
            response = await getAgentContext(db, { name: contextName, orgId: null })
        } catch (error) {
            logger.error(`${logCtx} failed fetching agent context "${contextName}":`, error)
            throw error
        }
        if (isActionError(response)) {
            logger.error(`${logCtx} agent context "${contextName}" returned error: ${errorToString(response)}`)
            throw new Error(errorToString(response))
        }
        if (response.content) combinedContextString += response.content + '\n'
    }

    combinedContextString += await generateDataSourcesContextString(orgId)
    return combinedContextString
}

async function readFileOrNull(filePath: string): Promise<string | null> {
    try {
        return await fs.readFile(filePath, 'utf-8')
    } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null
        throw e
    }
}

export type WriteAgentContextOptions = {
    targetDir: string
    language: Language
    orgId: string
    pastDate: Date
    logCtx?: string
}

// Overwrites only when the file is missing or still matches the last generated content, and
// backdates the mtime so Submit's "files changed" gate does not trip.
export async function writeAgentContext({
    targetDir,
    language,
    orgId,
    pastDate,
    logCtx = '[agent-context]',
}: WriteAgentContextOptions): Promise<void> {
    const generated = await buildContextString(language, orgId, logCtx)
    const contextPath = path.join(targetDir, CONTEXT_FILE_NAME)
    const sentinelPath = path.join(targetDir, SENTINEL_FILE_NAME)

    const existing = await readFileOrNull(contextPath)

    if (existing !== null) {
        const lastHash = (await readFileOrNull(sentinelPath))?.trim() ?? null
        if (lastHash === null || sha256(existing) !== lastHash) {
            logger.info(`${logCtx} preserving user-modified ${CONTEXT_FILE_NAME} in ${targetDir}`)
            return
        }
        if (existing === generated) {
            logger.info(`${logCtx} ${CONTEXT_FILE_NAME} unchanged, skipping rewrite`)
            return
        }
    }

    try {
        await fs.mkdir(targetDir, { recursive: true })
        await fs.writeFile(contextPath, generated, 'utf-8')
        await fs.utimes(contextPath, pastDate, pastDate)
        await fs.writeFile(sentinelPath, sha256(generated), 'utf-8')
        await fs.utimes(sentinelPath, pastDate, pastDate)
    } catch (error) {
        logger.error(`${logCtx} failed writing ${CONTEXT_FILE_NAME} to ${contextPath}:`, error)
        throw error
    }
    logger.info(`${logCtx} wrote ${CONTEXT_FILE_NAME} (${generated.length} bytes)`)
}
