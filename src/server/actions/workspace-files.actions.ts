'use server'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Action, z } from './action'
import { DEV_ENV, getConfigValue } from '@/server/config'
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
        if (!DEV_ENV) {
            coderFilesPath += `/${studyId}`
        }
        const entries = await fs.readdir(coderFilesPath)

        // Filter to only text files (not directories or binary files)
        const files: string[] = []
        let lastModified: Date | null = null

        for (const entry of entries) {
            const filePath = path.join(coderFilesPath, entry)
            const stats = await fs.stat(filePath)

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
