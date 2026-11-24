import {
    RULESET_MANIFEST_FILE,
    rulesetManifestSchema,
    rulesetVersionPrefix,
    rulesetVersionSchema,
    type RulesetEnv,
    type RulesetManifest,
    type RulesetPerson,
} from '../../../services/semgrep-runner/protocol'
import {
    RULESET_POINTER_FILE,
    rulesetDraftFilesSchema,
    rulesetPointerSchema,
    rulesetRequestSchema,
    rulesetVersionNumber,
    type RulesetDraftFile,
    type RulesetPointer,
    type RulesetRequest,
} from '@/lib/semgrep-rulesets/schemas'
import { getText, listKeys, putText, RulesetPreconditionFailed } from './s3'

const CONCURRENCY = 8
const CREATE_VERSION_ATTEMPTS = 5

const envPrefix = (env: RulesetEnv) => `rulesets/${env}/`
const pointerKey = (env: RulesetEnv) => `${envPrefix(env)}${RULESET_POINTER_FILE}`
const requestKey = (env: RulesetEnv, requestId: string) => `${envPrefix(env)}requests/${requestId}.json`

async function mapLimited<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let next = 0
    const worker = async () => {
        while (next < items.length) {
            const index = next++
            results[index] = await run(items[index])
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
    return results
}

// Lists before reading: across accounts, a GetObject on a missing key can answer 403 rather than 404.
async function readIfPresent(key: string) {
    const { keys } = await listKeys(key)
    return keys.includes(key) ? getText(key) : null
}

export async function listVersionNumbers(env: RulesetEnv): Promise<number[]> {
    const { commonPrefixes } = await listKeys(envPrefix(env), '/')
    return commonPrefixes
        .map((prefix) => prefix.slice(envPrefix(env).length, -1))
        .filter((name) => rulesetVersionSchema.safeParse(name).success)
        .map(rulesetVersionNumber)
        .sort((a, b) => a - b)
}

export async function readPublished(env: RulesetEnv): Promise<{ pointer: RulesetPointer; etag: string } | null> {
    const object = await readIfPresent(pointerKey(env))
    if (!object) return null
    return { pointer: rulesetPointerSchema.parse(JSON.parse(object.body)), etag: object.etag }
}

export async function readRequest(env: RulesetEnv, requestId: string) {
    const object = await readIfPresent(requestKey(env, requestId))
    if (!object) return null
    return { record: rulesetRequestSchema.parse(JSON.parse(object.body)), etag: object.etag }
}

export async function readManifest(env: RulesetEnv, version: string): Promise<RulesetManifest | null> {
    const object = await readIfPresent(`${rulesetVersionPrefix(env, version)}${RULESET_MANIFEST_FILE}`)
    return object ? rulesetManifestSchema.parse(JSON.parse(object.body)) : null
}

// Newest first. A version whose version.json is not written yet is left out.
export async function listManifests(env: RulesetEnv): Promise<RulesetManifest[]> {
    const numbers = (await listVersionNumbers(env)).reverse()
    const manifests = await mapLimited(numbers, (number) => readManifest(env, `v${number}`))
    return manifests.filter((manifest) => manifest !== null)
}

export async function readVersionFiles(env: RulesetEnv, manifest: RulesetManifest): Promise<RulesetDraftFile[]> {
    const prefix = rulesetVersionPrefix(env, manifest.version)
    return mapLimited(manifest.files, async (path) => ({ path, content: (await getText(`${prefix}${path}`)).body }))
}

export type CreateVersionInput = {
    env: RulesetEnv
    files: RulesetDraftFile[]
    changeNote: string
    author: RulesetPerson
    source: RulesetManifest['source']
}

// version.json goes first and create-only, which claims the number; a lost race takes the next one.
export async function createVersion({ env, files, changeNote, author, source }: CreateVersionInput) {
    const draft = rulesetDraftFilesSchema.parse(files)
    for (let attempt = 1; ; attempt++) {
        const numbers = await listVersionNumbers(env)
        const manifest = rulesetManifestSchema.parse({
            schemaVersion: 1,
            version: `v${(numbers.at(-1) ?? 0) + 1}`,
            env,
            createdAt: new Date().toISOString(),
            author,
            changeNote,
            source,
            files: draft.map((file) => file.path),
        })
        const prefix = rulesetVersionPrefix(env, manifest.version)
        try {
            await putText(`${prefix}${RULESET_MANIFEST_FILE}`, JSON.stringify(manifest), { ifNoneMatch: '*' })
        } catch (error) {
            if (error instanceof RulesetPreconditionFailed && attempt < CREATE_VERSION_ATTEMPTS) continue
            throw error
        }
        await mapLimited(draft, (file) => putText(`${prefix}${file.path}`, file.content, { ifNoneMatch: '*' }))
        return manifest
    }
}

export const writePointer = (env: RulesetEnv, pointer: RulesetPointer, etag: string | null) =>
    putText(
        pointerKey(env),
        JSON.stringify(rulesetPointerSchema.parse(pointer)),
        etag ? { ifMatch: etag } : { ifNoneMatch: '*' },
    )

export const claimRequest = (env: RulesetEnv, record: RulesetRequest) =>
    putText(requestKey(env, record.requestId), JSON.stringify(record), { ifNoneMatch: '*' })

export const finishRequest = (env: RulesetEnv, record: RulesetRequest, etag: string) =>
    putText(requestKey(env, record.requestId), JSON.stringify(record), { ifMatch: etag })
