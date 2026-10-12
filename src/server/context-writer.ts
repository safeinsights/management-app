import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { db } from '@/database'
import type { Language } from '@/database/types'
import { ContextName, getAgentContext } from '@/lib/agent-context'
import { errorToString, isActionError } from '@/lib/errors'
import { generateDataSourcesContextString } from '@/server/utils'
import logger from '@/lib/logger'
import { studyFileStore } from '@/server/workspace-files'

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

type ContextFiles = {
    describe: string
    read(name: string): Promise<string | null>
    write(name: string, content: string, mtime: Date): Promise<void>
}

const directoryFiles = (dir: string): ContextFiles => ({
    describe: dir,
    async read(name) {
        try {
            return await fs.readFile(path.join(dir, name), 'utf-8')
        } catch (e) {
            if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null
            throw e
        }
    },
    async write(name, content, mtime) {
        const filePath = path.join(dir, name)
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(filePath, content, 'utf-8')
        await fs.utimes(filePath, mtime, mtime)
    },
})

const studyFiles = async (studyId: string): Promise<ContextFiles> => {
    const store = await studyFileStore()
    return {
        describe: `study ${studyId}`,
        read: async (name) => (await store.read(studyId, name))?.toString('utf-8') ?? null,
        write: (name, content, mtime) => store.write(studyId, name, content, mtime),
    }
}

export type WriteAgentContextOptions = ({ targetDir: string } | { studyId: string }) & {
    language: Language
    orgId: string
    pastDate: Date
    logCtx?: string
}

// Overwrites only when the file is missing or still matches the last generated content, and
// backdates the mtime so Submit's "files changed" gate does not trip.
export async function writeAgentContext({
    language,
    orgId,
    pastDate,
    logCtx = '[agent-context]',
    ...target
}: WriteAgentContextOptions): Promise<void> {
    const generated = await buildContextString(language, orgId, logCtx)
    const files = 'studyId' in target ? await studyFiles(target.studyId) : directoryFiles(target.targetDir)

    const existing = await files.read(CONTEXT_FILE_NAME)

    if (existing !== null) {
        const lastHash = (await files.read(SENTINEL_FILE_NAME))?.trim() ?? null
        if (lastHash === null || sha256(existing) !== lastHash) {
            logger.info(`${logCtx} preserving user-modified ${CONTEXT_FILE_NAME} in ${files.describe}`)
            return
        }
        if (existing === generated) {
            logger.info(`${logCtx} ${CONTEXT_FILE_NAME} unchanged, skipping rewrite`)
            return
        }
    }

    try {
        await files.write(CONTEXT_FILE_NAME, generated, pastDate)
        await files.write(SENTINEL_FILE_NAME, sha256(generated), pastDate)
    } catch (error) {
        logger.error(`${logCtx} failed writing ${CONTEXT_FILE_NAME} to ${files.describe}:`, error)
        throw error
    }
    logger.info(`${logCtx} wrote ${CONTEXT_FILE_NAME} (${generated.length} bytes)`)
}
