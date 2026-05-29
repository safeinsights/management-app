'use server'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Action, z } from './action'
import { getInfoForStudyId } from '@/server/db/queries'
import { sanitizeFileName } from '@/lib/utils'
import { ensureBaselineJob } from '@/server/db/mutations'
import { studyFilesDir } from '@/server/workspace-files'

export const uploadWorkspaceFileAction = new Action('uploadWorkspaceFileAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), file: z.instanceof(File) }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId, file } }) => {
        await ensureBaselineJob(db, studyId)

        const filesPath = await studyFilesDir(studyId)
        await fs.mkdir(filesPath, { recursive: true })

        const fileName = sanitizeFileName(file.name)
        const filePath = path.join(filesPath, fileName)
        const buffer = Buffer.from(await file.arrayBuffer())
        await fs.writeFile(filePath, buffer)

        return { fileName }
    })

export const readWorkspaceFileAction = new Action('readWorkspaceFileAction', {})
    .params(z.object({ studyId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId, fileName } }) => {
        const filesPath = await studyFilesDir(studyId)
        const sanitized = sanitizeFileName(fileName)
        const filePath = path.join(filesPath, sanitized)
        const contents = await fs.readFile(filePath, 'utf-8')
        return { fileName: sanitized, contents }
    })

export const deleteWorkspaceFileAction = new Action('deleteWorkspaceFileAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId, fileName } }) => {
        const filesPath = await studyFilesDir(studyId)
        const sanitized = sanitizeFileName(fileName)
        const filePath = path.join(filesPath, sanitized)

        try {
            await fs.unlink(filePath)
        } catch (e) {
            if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
                // File already gone, that's fine
            } else {
                throw e
            }
        }

        return { success: true }
    })
