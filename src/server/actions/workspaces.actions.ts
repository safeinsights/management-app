'use server'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { currentUser } from '@clerk/nextjs/server'
import { Action, z } from './action'
import { getConfigValue } from '@/server/config'
import { getInfoForStudyId } from '@/server/db/queries'
import { resetBaselineJob } from '@/server/db/mutations'
import { createSession, OrchestratorError } from '@/server/orchestrator/client'
import { initializeWorkspaceCodeFiles } from '@/server/workspace-files'

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
        if (await getConfigValue('ORCHESTRATOR_URL', false)) {
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

export const startIdeSessionAction = new Action('startIdeSessionAction', { performsMutations: true })
    .params(z.object({ studyId: z.string().nonempty() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')

        await resetBaselineJob(db, studyId)
        await initializeWorkspaceCodeFiles(studyId)

        const orchestratorURL = await getConfigValue('ORCHESTRATOR_URL', false)
        if (!orchestratorURL) {
            // Local dev / CI shortcut: no orchestrator configured.
            await new Promise((resolve) => setTimeout(resolve, 1000))
            return { sessionUrl: `https://ide.dev.example.com/session/${studyId}` }
        }

        const clerkUser = await currentUser()
        const userEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? ''

        try {
            const result = await createSession({
                user_id: session.user.id,
                study_id: studyId,
                user_email: userEmail,
            })
            return { sessionUrl: result.session_url }
        } catch (err) {
            if (err instanceof OrchestratorError && err.status === 503) {
                return {
                    error: 'IDE is starting up — please try again in a few seconds.',
                    retryAfter: err.retryAfterSec ?? 5,
                }
            }
            throw err
        }
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
