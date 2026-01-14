'use server'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Action, z } from './action'
import { createUserAndWorkspace, getCoderWorkspaceUrl } from '../coder'
import { CODER_DISABLED, getConfigValue } from '@/server/config'
import { getInfoForStudyId } from '@/server/db/queries'

const isMainFile = (filename: string): boolean => {
    const basename = path.basename(filename, path.extname(filename))
    return basename.toLowerCase() === 'main'
}

export const listWorkspaceFilesAction = new Action('listWorkspaceFilesAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId } }) => {
        let coderFilesPath = await getConfigValue('CODER_FILES')
        if (!CODER_DISABLED) {
            coderFilesPath += `/${studyId}`
        }
        const entries = await fs.readdir(coderFilesPath)

        // Filter to only text files (not directories or binary files)
        const files: string[] = []
        let lastModified: Date | null = null

        for (const entry of entries) {
            const filePath = path.join(coderFilesPath, entry)
            let stats
            try {
                stats = await fs.lstat(filePath)
            } catch {
                continue
            }

            // Skip symlinks and non-files (directories, etc.)
            if (stats.isSymbolicLink()) continue
            if (!stats.isFile()) continue
            if (stats.size === 0) continue

            files.push(entry)

            if (!lastModified || stats.mtime > lastModified) {
                lastModified = stats.mtime
            }
        }

        return {
            files,
            suggestedMain: files.find(isMainFile),
            lastModified: lastModified?.toISOString() ?? null,
        }
    })

export const createUserAndWorkspaceAction = new Action('createUserAndWorkspaceAction', {})
    .params(
        z.object({
            studyId: z.string().nonempty(),
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        if (CODER_DISABLED) {
            return {
                success: true,
                workspace: { id: `dev-workspace-${studyId}` },
            }
        }
        return await createUserAndWorkspace(studyId)
    })

export const getWorkspaceUrlAction = new Action('getWorkspaceUrlAction', {})
    .params(
        z.object({
            studyId: z.string().nonempty(),
            workspaceId: z.string(),
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId, workspaceId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        if (!workspaceId) return
        if (CODER_DISABLED) {
            // these envs do not have a 'real' coder setup
            await new Promise((resolve) => setTimeout(resolve, 3000))
            return `https://coder.dev.example.com/workspace/${studyId}`
        }
        return await getCoderWorkspaceUrl(studyId, workspaceId)
    })
