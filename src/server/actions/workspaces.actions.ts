'use server'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Action, z } from './action'
import { createUserAndWorkspace, getCoderWorkspaceLaunchStatus, type WorkspaceLaunchStatus } from '../coder'
import { CODER_DISABLED, getConfigValue } from '@/server/config'
import { getInfoForStudyId } from '@/server/db/queries'
import { resetBaselineJob } from '@/server/db/mutations'
import { initializeDevWorkspaceFiles } from '@/server/dev'

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

// Ensures the workspace exists and is running: creates it if missing, starts it if stopped.
// Kept as a one-shot mutation (not folded into the polled status action) because the baseline
// reset and the build POST must run once per launch, not on every refetch.
export const ensureWorkspaceAction = new Action('ensureWorkspaceAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string().nonempty(),
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        await resetBaselineJob(db, studyId)
        if (CODER_DISABLED) {
            return {
                success: true,
                workspace: { id: `dev-workspace-${studyId}` },
            }
        }
        return await createUserAndWorkspace(studyId)
    })

const cursorsSchema = z
    .object({
        build: z.number().nullable(),
        agents: z.record(z.string(), z.number().nullable()),
    })
    .optional()

export const getWorkspaceLaunchStatusAction = new Action('getWorkspaceLaunchStatusAction', {})
    .params(
        z.object({
            studyId: z.string().nonempty(),
            cursors: cursorsSchema,
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId, cursors }, session }): Promise<WorkspaceLaunchStatus> => {
        if (!session) throw new Error('Unauthorized')
        if (CODER_DISABLED) {
            // these envs do not have a 'real' coder setup
            await initializeDevWorkspaceFiles(studyId)
            return {
                phase: 'ready',
                buildStatus: 'succeeded',
                ready: true,
                failed: false,
                reason: 'dev workspace ready',
                lastLogAt: null,
                cursors: { build: null, agents: {} },
                url: `https://coder.dev.example.com/workspace/${studyId}`,
            }
        }
        return await getCoderWorkspaceLaunchStatus(studyId, cursors)
    })

export const getStarterCodeInfoAction = new Action('getStarterCodeInfoAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId } }) => {
        const { fetchLatestCodeEnvForStudyId } = await import('@/server/db/queries')
        // Studies are always created from a code env — if this throws, it's a data integrity issue
        const codeEnv = await fetchLatestCodeEnvForStudyId(studyId)
        const fileNames = codeEnv.starterCodeFileNames ?? []
        if (fileNames.length === 0) return { starterFiles: [] }

        const { signedUrlForFile } = await import('@/server/aws')
        const { basename } = await import('@/lib/paths')
        const starterFiles = await Promise.all(
            fileNames.map(async (filePath: string) => ({
                name: basename(filePath),
                url: await signedUrlForFile(filePath),
            })),
        )
        return { starterFiles }
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
            createdAt: studyJob.createdAt.toISOString(),
            mainFileName: files.find((f) => f.fileType === 'MAIN-CODE')?.name ?? null,
            fileNames: files.map((f) => f.name),
        }
    })
