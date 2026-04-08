'use server'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Action, z } from './action'
import { createUserAndWorkspace, getCoderWorkspaceUrl } from '../coder'
import { CODER_DISABLED, getConfigValue } from '@/server/config'
import { getInfoForStudyId } from '@/server/db/queries'
import type { DB } from '@/database/types'
import type { Kysely } from 'kysely'

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

        let entries: string[] = []
        try {
            entries = await fs.readdir(coderFilesPath)
        } catch (e) {
            if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
                // Directory doesn't exist yet, just return empty list
                return {
                    files: [],
                    suggestedMain: undefined,
                    lastModified: null,
                }
            }
            throw e
        }

        const files: { name: string; size: number; mtime: string }[] = []
        let lastModified: Date | null = null

        for (const entry of entries) {
            if (entry.startsWith('.')) continue

            const filePath = path.join(coderFilesPath, entry)
            let stats
            try {
                stats = await fs.lstat(filePath)
            } catch {
                continue
            }

            if (stats.isSymbolicLink()) continue
            if (!stats.isFile()) continue
            if (stats.size === 0) continue

            files.push({ name: entry, size: stats.size, mtime: stats.mtime.toISOString() })

            if (!lastModified || stats.mtime > lastModified) {
                lastModified = stats.mtime
            }
        }

        return {
            files,
            suggestedMain: files.find((f) => isMainFile(f.name))?.name,
            lastModified: lastModified?.toISOString() ?? null,
        }
    })

async function readWorkspaceFileNames(studyId: string): Promise<string[]> {
    let coderFilesPath = await getConfigValue('CODER_FILES')
    if (!CODER_DISABLED) {
        coderFilesPath += `/${studyId}`
    }

    const fileNames: string[] = []
    try {
        const entries = await fs.readdir(coderFilesPath)
        for (const entry of entries) {
            if (entry.startsWith('.')) continue
            const filePath = path.join(coderFilesPath, entry)
            const stats = await fs.lstat(filePath).catch(() => null)
            if (stats && stats.isFile() && stats.size > 0) {
                fileNames.push(entry)
            }
        }
    } catch {
        // Directory may not exist yet
    }
    return fileNames
}

async function ensureBaselineJob(db: Kysely<DB>, studyId: string) {
    const existingJob = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId).executeTakeFirst()

    if (existingJob) return

    const fileNames = await readWorkspaceFileNames(studyId)
    if (fileNames.length === 0) return

    const studyJob = await db
        .insertInto('studyJob')
        .values({ studyId })
        .returning(['id', 'createdAt'])
        .executeTakeFirstOrThrow()

    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: studyJob.id, status: 'INITIATED' })
        .executeTakeFirstOrThrow()

    const mainFileName = fileNames.find(isMainFile) ?? fileNames[0]
    await db
        .insertInto('studyJobFile')
        .values({ name: mainFileName, path: '', studyJobId: studyJob.id, fileType: 'MAIN-CODE' })
        .executeTakeFirstOrThrow()

    for (const fileName of fileNames.filter((f) => f !== mainFileName)) {
        await db
            .insertInto('studyJobFile')
            .values({ name: fileName, path: '', studyJobId: studyJob.id, fileType: 'SUPPLEMENTAL-CODE' })
            .executeTakeFirstOrThrow()
    }

    return studyJob
}

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

export const ensureBaselineJobAction = new Action('ensureBaselineJobAction', { performsMutations: true })
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId } }) => {
        await ensureBaselineJob(db, studyId)
    })

export const getStarterCodeInfoAction = new Action('getStarterCodeInfoAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId } }) => {
        const { fetchLatestCodeEnvForStudyId } = await import('@/server/db/queries')
        const codeEnv = await fetchLatestCodeEnvForStudyId(studyId)
        const { signedUrlForFile } = await import('@/server/aws')
        const starterCodeUrl = await signedUrlForFile(codeEnv.starterCodePath)
        const { basename } = await import('@/lib/paths')
        const starterFileName = basename(codeEnv.starterCodePath)
        return { starterFileName, starterCodeUrl }
    })

export const getLastSubmissionInfoAction = new Action('getLastSubmissionInfoAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId } }) => {
        const studyJob = await db
            .selectFrom('studyJob')
            .select(['id', 'createdAt'])
            .where('studyId', '=', studyId)
            .orderBy('createdAt', 'desc')
            .executeTakeFirst()

        if (!studyJob) return null

        const files = await db
            .selectFrom('studyJobFile')
            .select(['name', 'fileType'])
            .where('studyJobId', '=', studyJob.id)
            .execute()

        return {
            submittedAt: studyJob.createdAt.toISOString(),
            mainFileName: files.find((f) => f.fileType === 'MAIN-CODE')?.name ?? null,
            fileNames: files.map((f) => f.name),
        }
    })
