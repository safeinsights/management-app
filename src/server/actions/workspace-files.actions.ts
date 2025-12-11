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
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId } }) => {
        let coderFilesPath = await getConfigValue('CODER_FILES')
        if (!DEV_ENV) {
            coderFilesPath += `/${studyId}`
        }
        const files = await fs.readdir(coderFilesPath)

        // Get the most recent modification time from all files
        let lastModified: Date | null = null
        for (const file of files) {
            const filePath = path.join(coderFilesPath, file)
            const stats = await fs.stat(filePath)
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
