import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Readable } from 'node:stream'
import { GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3'
import { processEnv } from './config.ts'
import { distinctPaths, isSafeRelativePath, type RunnerError } from './protocol.ts'
import { NOTEBOOK_ROOT, SUBMISSION_ROOT } from './semgrep.ts'

export type Workspace = {
    root: string
    src: string
    notebooks: string
    rules: string
    report: string
    // TMPDIR of the Semgrep processes, so their temp files go when the workspace does, also after a kill.
    tmp: string
}

export class RunnerFailure extends Error {
    readonly code: RunnerError

    constructor(code: RunnerError, options?: { cause?: unknown }) {
        super(code, options)
        this.code = code
    }
}

// Semgrep writes settings, a log and a version cache, and Lambda starts with an empty /tmp.
const semgrepHomeDirs = (env: Record<string, string | undefined>) =>
    [env.SEMGREP_SETTINGS_FILE, env.SEMGREP_LOG_FILE, env.SEMGREP_VERSION_CACHE_PATH].flatMap((file) =>
        file ? [path.dirname(file)] : [],
    )

export async function createWorkspace(env: Record<string, string | undefined> = processEnv()): Promise<Workspace> {
    try {
        await Promise.all(semgrepHomeDirs(env).map((dir) => fs.mkdir(dir, { recursive: true })))
        const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'semgrep-run-')))
        const work = {
            root,
            src: path.join(root, SUBMISSION_ROOT),
            notebooks: path.join(root, NOTEBOOK_ROOT),
            rules: path.join(root, 'rules'),
            report: path.join(root, 'reports', 'semgrep.json'),
            tmp: path.join(root, 'tmp'),
        }
        await Promise.all([work.src, work.notebooks, work.rules, work.tmp].map((dir) => fs.mkdir(dir)))
        return work
    } catch (error) {
        throw new RunnerFailure('workspace-failed', { cause: error })
    }
}

export async function removeWorkspace(work: Workspace): Promise<void> {
    await fs.rm(work.root, { recursive: true, force: true })
}

export function safeJoin(root: string, relative: string): string {
    const target = path.join(root, relative)
    if (!isSafeRelativePath(relative) || !target.startsWith(`${root}${path.sep}`)) {
        throw new RunnerFailure('unsafe-key')
    }
    return target
}

async function openTarget(root: string, relative: string): Promise<fs.FileHandle> {
    const target = safeJoin(root, relative)
    try {
        await fs.mkdir(path.dirname(target), { recursive: true })
        return await fs.open(target, 'wx')
    } catch (error) {
        throw new RunnerFailure('workspace-failed', { cause: error })
    }
}

export async function writeFiles(root: string, files: { path: string; content: string }[]): Promise<void> {
    for (const file of files) {
        const handle = await openTarget(root, file.path)
        try {
            await handle.writeFile(file.content)
        } catch (error) {
            throw new RunnerFailure('workspace-failed', { cause: error })
        } finally {
            await handle.close()
        }
    }
}

// Errors raised by the local file system while a download is written, rather than by S3.
const LOCAL_WRITE_ERRORS = new Set(['ENOSPC', 'EDQUOT', 'EISDIR', 'ENOTDIR', 'EEXIST', 'EACCES', 'EROFS', 'EFBIG'])

function isLocalWriteError(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code
    return typeof code === 'string' && LOCAL_WRITE_ERRORS.has(code)
}

export type PrefixDownload = {
    bucket: string
    prefix: string
    dir: string
    signal: AbortSignal
    failure: RunnerError
    expectedBucketOwner?: string
    include?: (relative: string) => boolean
}

async function listKeys(s3: S3Client, download: PrefixDownload): Promise<string[]> {
    const keys: string[] = []
    let ContinuationToken: string | undefined
    do {
        const page = await s3.send(
            new ListObjectsV2Command({
                Bucket: download.bucket,
                Prefix: download.prefix,
                ContinuationToken,
                ExpectedBucketOwner: download.expectedBucketOwner,
            }),
            { abortSignal: download.signal },
        )
        for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key)
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (ContinuationToken)
    return keys
}

async function downloadKey(s3: S3Client, download: PrefixDownload, key: string, relative: string): Promise<void> {
    const handle = await openTarget(download.dir, relative)
    try {
        const object = await s3.send(
            new GetObjectCommand({
                Bucket: download.bucket,
                Key: key,
                ExpectedBucketOwner: download.expectedBucketOwner,
            }),
            { abortSignal: download.signal },
        )
        await handle.writeFile(object.Body as Readable, { signal: download.signal })
    } catch (error) {
        throw new RunnerFailure(isLocalWriteError(error) ? 'workspace-failed' : download.failure, { cause: error })
    } finally {
        await handle.close()
    }
}

// The app keeps empty and "." segments in uploaded names (sanitizeFileName); a file path ignores them.
export const keyPath = (key: string, prefix: string) =>
    key
        .slice(prefix.length)
        .split('/')
        .filter((segment) => segment !== '' && segment !== '.')
        .join('/')

/** Writes every object under the prefix into dir, keyed by its path below the prefix. Returns the count. */
export async function downloadPrefix(s3: S3Client, download: PrefixDownload): Promise<number> {
    let keys: string[]
    try {
        keys = await listKeys(s3, download)
    } catch (error) {
        throw new RunnerFailure(download.failure, { cause: error })
    }
    const files = keys
        .filter((key) => !key.endsWith('/'))
        .map((key) => ({ key, relative: keyPath(key, download.prefix) }))
        .filter(({ relative }) => !download.include || download.include(relative))
    for (const { relative } of files) safeJoin(download.dir, relative)
    if (!distinctPaths(files.map(({ relative }) => ({ path: relative })))) throw new RunnerFailure('workspace-failed')

    download.signal.throwIfAborted()
    await forEachLimited(files, DOWNLOAD_CONCURRENCY, ({ key, relative }) => downloadKey(s3, download, key, relative))
    return files.length
}

const DOWNLOAD_CONCURRENCY = 16

// Stops taking new items after the first failure, but waits for the ones in flight, so nothing still
// writes into the workspace when the caller removes it.
async function forEachLimited<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
    let next = 0
    const failures: unknown[] = []
    const worker = async () => {
        while (failures.length === 0 && next < items.length) {
            const item = items[next++]
            await run(item).catch((error: unknown) => failures.push(error))
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
    if (failures.length) throw failures[0]
}
