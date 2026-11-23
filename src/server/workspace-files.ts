import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    NoSuchKey,
    NotFound,
    PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getConfigValue } from '@/server/config'
import { getS3Client } from '@/server/aws'
import { getMicrovmConfig } from '@/server/microvm/config'

export async function getStudyFilesPath(studyId: string): Promise<string> {
    return path.join(await getConfigValue('CODER_FILES'), studyId)
}

export type StudyFile = { name: string; size: number; mtime: Date }

/**
 * The top-level files of a study's workspace. Coder workspaces share them through EFS; MicroVM
 * workspaces keep them in S3 and sync edits back from the MicroVM.
 */
export interface StudyFileStore {
    /** Regular files only, dotfiles included; callers decide what counts as a study file. */
    list(studyId: string): Promise<StudyFile[]>
    read(studyId: string, name: string): Promise<Buffer | null>
    write(studyId: string, name: string, data: Buffer | string, mtime?: Date): Promise<void>
    /** Idempotent: removing a missing file is not an error. */
    remove(studyId: string, name: string): Promise<void>
}

const isMissing = (e: unknown) => e instanceof Error && 'code' in e && e.code === 'ENOENT'

const fsStore: StudyFileStore = {
    async list(studyId) {
        const dir = await getStudyFilesPath(studyId)
        let entries: string[]
        try {
            entries = await fs.readdir(dir)
        } catch (e) {
            if (isMissing(e)) return []
            throw e
        }
        const files: StudyFile[] = []
        for (const name of entries) {
            try {
                const stats = await fs.lstat(path.join(dir, name))
                if (stats.isFile()) files.push({ name, size: stats.size, mtime: stats.mtime })
            } catch {
                continue
            }
        }
        return files
    },

    async read(studyId, name) {
        try {
            return await fs.readFile(path.join(await getStudyFilesPath(studyId), name))
        } catch (e) {
            if (isMissing(e)) return null
            throw e
        }
    },

    async write(studyId, name, data, mtime) {
        const dir = await getStudyFilesPath(studyId)
        const filePath = path.join(dir, name)
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(filePath, data)
        if (mtime) await fs.utimes(filePath, mtime, mtime)
    },

    async remove(studyId, name) {
        try {
            await fs.unlink(path.join(await getStudyFilesPath(studyId), name))
        } catch (e) {
            if (!isMissing(e)) throw e
        }
    },
}

export const microvmStudyFilesPrefix = (studyId: string) => `studies/${studyId}/files/`

// S3 cannot set LastModified, and the submit gate compares file times against the round's baseline,
// so the file's own mtime rides along as object metadata.
const MTIME_METADATA = 'mtime'

const s3Store = (bucket: string): StudyFileStore => ({
    async list(studyId) {
        const prefix = microvmStudyFilesPrefix(studyId)
        const { Contents = [] } = await getS3Client().send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: '/' }),
        )
        return Promise.all(
            Contents.map(async ({ Key, Size, LastModified }) => {
                const head = await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: Key! }))
                const seconds = Number(head.Metadata?.[MTIME_METADATA])
                return {
                    name: Key!.slice(prefix.length),
                    size: Size ?? 0,
                    mtime: Number.isFinite(seconds) ? new Date(seconds * 1000) : (LastModified ?? new Date()),
                }
            }),
        )
    },

    async read(studyId, name) {
        try {
            const object = await getS3Client().send(
                new GetObjectCommand({ Bucket: bucket, Key: microvmStudyFilesPrefix(studyId) + name }),
            )
            return Buffer.from(await object.Body!.transformToByteArray())
        } catch (e) {
            if (e instanceof NoSuchKey || e instanceof NotFound) return null
            throw e
        }
    },

    async write(studyId, name, data, mtime = new Date()) {
        await getS3Client().send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: microvmStudyFilesPrefix(studyId) + name,
                Body: data,
                Metadata: { [MTIME_METADATA]: String(Math.floor(mtime.getTime() / 1000)) },
            }),
        )
    },

    async remove(studyId, name) {
        await getS3Client().send(
            new DeleteObjectCommand({ Bucket: bucket, Key: microvmStudyFilesPrefix(studyId) + name }),
        )
    },
})

export async function studyFileStore(): Promise<StudyFileStore> {
    const microvm = await getMicrovmConfig()
    return microvm ? s3Store(microvm.workspacesBucket) : fsStore
}

/** The files the researcher sees in the workspace: no dotfiles, nothing empty. */
export async function listStudyFiles(studyId: string): Promise<StudyFile[]> {
    const files = await (await studyFileStore()).list(studyId)
    return files.filter((file) => !file.name.startsWith('.') && file.size > 0)
}

export async function readStudyFileStream(studyId: string, name: string): Promise<ReadableStream> {
    const contents = await (await studyFileStore()).read(studyId, name)
    if (!contents) throw new Error(`File not found: ${name}`)
    return new Blob([new Uint8Array(contents)]).stream()
}
