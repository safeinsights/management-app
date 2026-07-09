'use server'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Action, z } from './action'
import { createUserAndWorkspace, getCoderWorkspaceLaunchStatus, type WorkspaceLaunchStatus } from '../coder'
import { CODER_DISABLED, getConfigValue } from '@/server/config'
import { getInfoForStudyId, latestSubmittedJobForStudy } from '@/server/db/queries'
import { ensureRoundJobForLaunch } from '@/server/db/mutations'
import { initializeDevWorkspaceFiles } from '@/server/dev'

const isMainFile = (filename: string): boolean => {
    const basename = path.basename(filename, path.extname(filename))
    return basename.toLowerCase() === 'main'
}

// Whether the study's workspace currently holds any researcher-visible file. Mirrors the filtering in
// listWorkspaceFilesAction (skip dotfiles, symlinks, non-files, empty files) so "has files" matches
// exactly what the review table shows — and what submit-enable is computed from.
async function studyHasWorkspaceFiles(studyId: string): Promise<boolean> {
    let coderFilesPath = await getConfigValue('CODER_FILES')
    if (!CODER_DISABLED) {
        coderFilesPath += `/${studyId}`
    }

    let entries: string[]
    try {
        entries = await fs.readdir(coderFilesPath)
    } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return false
        throw e
    }

    for (const entry of entries) {
        if (entry.startsWith('.')) continue
        try {
            const stats = await fs.lstat(path.join(coderFilesPath, entry))
            if (stats.isSymbolicLink() || !stats.isFile() || stats.size === 0) continue
            return true
        } catch {
            continue
        }
    }
    return false
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
        const hasWorkspaceFiles = await studyHasWorkspaceFiles(studyId)
        await ensureRoundJobForLaunch(db, studyId, { hasWorkspaceFiles })
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
        agent: z.number().nullable(),
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
                buildStatus: 'running',
                buildLogLines: [],
                agentStatus: null,
                agentLogLines: [],
                ready: true,
                failed: false,
                reason: 'dev workspace ready',
                cursors: { build: null, agent: null },
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
        const { pathForStarterCode } = await import('@/lib/paths')
        // starterCodeFileNames holds bare names, not S3 keys — sign the key the upload actually wrote to.
        const starterFiles = await Promise.all(
            fileNames.map(async (fileName: string) => ({
                name: fileName,
                url: await signedUrlForFile(
                    pathForStarterCode({ orgSlug: codeEnv.slug, codeEnvId: codeEnv.id, fileName }),
                    { ResponseContentDisposition: 'inline' },
                ),
            })),
        )
        return { starterFiles }
    })

export const getLastSubmissionInfoAction = new Action('getLastSubmissionInfoAction', {})
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ db, params: { studyId } }) => {
        // Submit-enable compares workspace file mtimes against this baseline. Anchor it on the last
        // *submission* (the CODE-SUBMITTED moment), not the current round job's createdAt: reusing a
        // job means its createdAt no longer advances on relaunch, so anchoring there would let Submit
        // re-enable with no edits after a study was already submitted (OTTER-601). Comparing against
        // the submission time means Submit only lights up when a file actually changed since submit.
        const submittedJob = await latestSubmittedJobForStudy(studyId)

        if (submittedJob) {
            const submittedAt = submittedJob.statusChanges.find((s) => s.status === 'CODE-SUBMITTED')?.createdAt
            const codeFiles = submittedJob.files.filter(
                (f) => f.fileType === 'MAIN-CODE' || f.fileType === 'SUPPLEMENTAL-CODE',
            )
            return {
                createdAt: new Date(submittedAt ?? submittedJob.createdAt).toISOString(),
                mainFileName: codeFiles.find((f) => f.fileType === 'MAIN-CODE')?.name ?? null,
                fileNames: codeFiles.map((f) => f.name),
            }
        }

        // No submission yet: fall back to the current round job's createdAt so the first submit
        // enables once files are edited after the workspace was opened.
        const studyJob = await db
            .selectFrom('studyJob')
            .select(['createdAt'])
            .where('studyId', '=', studyId)
            .orderBy('id', 'desc')
            .executeTakeFirst()

        if (!studyJob) return null

        return {
            createdAt: studyJob.createdAt.toISOString(),
            mainFileName: null,
            fileNames: [],
        }
    })
