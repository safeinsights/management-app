import fs from 'fs'
import os from 'os'
import path from 'path'
import { db } from '@/database'
import { pathForStudyJobCodeFile } from '@/lib/paths'
import { storeS3File } from '@/server/aws'

export const readTestSupportFile = (file: string) => {
    return fs.promises.readFile(path.join(__dirname, '..', 'support', file), 'utf8')
}

// The bytes are arbitrary: the ingest routes and `storeJobFile` never read them.
export const testUploadFile = (name: string, type = 'application/zip') =>
    new File([new TextEncoder().encode('boom')], name, { type })

export const createWorkspaceDir = async (prefix: string) => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), `${prefix}-`))
    process.env.CODER_FILES = root
    return root
}

export const writeWorkspaceFiles = async (
    root: string,
    studyId: string,
    files: Record<string, string | Uint8Array>,
) => {
    const workspaceDir = path.join(root, studyId)
    await fs.promises.mkdir(workspaceDir, { recursive: true })
    await Promise.all(
        Object.entries(files).map(([fileName, content]) =>
            fs.promises.writeFile(path.join(workspaceDir, fileName), content),
        ),
    )
}

export const cleanupWorkspaceDirs = async (dirs: string[]) => {
    delete process.env.CODER_FILES
    await Promise.all(dirs.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true })))
}

// Stored in the local S3 the unit-test stack runs, so the actions that read code files get real bytes.
export const storeTestCodeFile = async (
    studyJobId: string,
    {
        name,
        contents,
        fileType = 'MAIN-CODE',
    }: { name: string; contents: string; fileType?: 'MAIN-CODE' | 'SUPPLEMENTAL-CODE' },
) => {
    const { orgSlug, studyId } = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select(['org.slug as orgSlug', 'study.id as studyId'])
        .where('studyJob.id', '=', studyJobId)
        .executeTakeFirstOrThrow()
    const info = { orgSlug, studyId, studyJobId }
    const filePath = pathForStudyJobCodeFile(info, name)
    await storeS3File(info, new Blob([contents]).stream(), filePath)
    return db
        .insertInto('studyJobFile')
        .values({ studyJobId, name, path: filePath, fileType })
        .returningAll()
        .executeTakeFirstOrThrow()
}
