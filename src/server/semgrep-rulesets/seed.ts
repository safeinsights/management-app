import fs from 'node:fs'
import path from 'node:path'
import type { RulesetDraftFile } from '@/lib/semgrep-rulesets/schemas'
import { enqueueJob } from '@/server/jobs/queue'
import {
    isRuleFile,
    RULESET_CORPUS_DIR,
    RULESET_ENVS,
    RULESET_RULES_DIR,
    RULESET_TESTS_DIR,
    rulesetVersionPrefix,
    type RulesetEnv,
    type RulesetManifest,
    type RulesetPerson,
} from '../../../services/semgrep-runner/protocol'
import { listKeys } from './s3'
import { createVersion, listVersionNumbers, readManifest, readPublished, readVersionFiles } from './store'

export const SEED_AUTHOR: RulesetPerson = { userId: null, name: 'OTTER-910 seed' }
const SEED_CHANGE_NOTE = 'Rules and fixtures from iac, with the research code corpus (OTTER-910)'

const utf8 = new TextDecoder('utf-8', { fatal: true })

// The store keeps text only, and a binary file read as text would be stored damaged without an error.
function readText(file: string): string {
    const bytes = fs.readFileSync(file)
    try {
        return utf8.decode(bytes)
    } catch {
        throw new Error(`${file} is not UTF-8 text`)
    }
}

const fileNames = (dir: string) =>
    fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()

// Dot entries (.git, .ipynb_checkpoints) are not research code.
const filesBelow = (dir: string) =>
    fs
        .readdirSync(dir, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep))
        .filter((segments) => !segments.some((segment) => segment.startsWith('.')))
        .map((segments) => segments.join('/'))
        .sort()

const stem = (name: string) => path.parse(name).name

export type SeedSource = { rulesDir: string; testsDir: string; corpusDirs: string[] }

/**
 * The ruleset files of the seed: each rule file, the fixture the gate pairs with it by name, and the
 * corpus folders under tests/corpus/<folder name>/. Other files of the tests folder (iac's
 * check-coverage.ts) stay behind.
 */
export function readSeedFiles({ rulesDir, testsDir, corpusDirs }: SeedSource): RulesetDraftFile[] {
    const rules = fileNames(rulesDir).filter(isRuleFile)
    const stems = new Set(rules.map(stem))
    const fixtures = fileNames(testsDir).filter((name) => stems.has(stem(name)))

    const paired = new Set(fixtures.map(stem))
    const unpaired = rules.filter((name) => !paired.has(stem(name)))
    if (unpaired.length) throw new Error(`no fixture in ${testsDir} for ${unpaired.join(', ')}`)

    const corpus = corpusDirs.flatMap((dir) =>
        filesBelow(dir).map((file) => ({
            path: `${RULESET_TESTS_DIR}/${RULESET_CORPUS_DIR}/${path.basename(path.resolve(dir))}/${file}`,
            content: readText(path.join(dir, file)),
        })),
    )
    return [
        ...rules.map((name) => ({
            path: `${RULESET_RULES_DIR}/${name}`,
            content: readText(path.join(rulesDir, name)),
        })),
        ...fixtures.map((name) => ({
            path: `${RULESET_TESTS_DIR}/${name}`,
            content: readText(path.join(testsDir, name)),
        })),
        ...corpus,
    ]
}

async function isComplete(env: RulesetEnv, manifest: RulesetManifest): Promise<boolean> {
    const prefix = rulesetVersionPrefix(env, manifest.version)
    const { keys } = await listKeys(prefix)
    return manifest.files.every((file) => keys.includes(`${prefix}${file}`))
}

function sameFiles(stored: RulesetDraftFile[], seed: RulesetDraftFile[]): boolean {
    const wanted = new Map(seed.map((file) => [file.path, file.content]))
    return (
        seed.length === stored.length &&
        wanted.size === stored.length &&
        stored.every((file) => wanted.get(file.path) === file.content)
    )
}

export type SeedPlan =
    | { env: RulesetEnv; action: 'create' }
    | { env: RulesetEnv; action: 'skip'; reason: 'published' | 'uploaded'; version: string }

// No role can delete a version, so a half uploaded one, or one the gate refused and the seed has since
// fixed, is replaced by the following number: only a complete latest version with these files is seeded.
export async function planSeed(env: RulesetEnv, files: RulesetDraftFile[]): Promise<SeedPlan> {
    const published = await readPublished(env)
    if (published) return { env, action: 'skip', reason: 'published', version: published.pointer.version }

    const latest = (await listVersionNumbers(env)).at(-1)
    const manifest = latest ? await readManifest(env, `v${latest}`) : null
    if (manifest && (await isComplete(env, manifest)) && sameFiles(await readVersionFiles(env, manifest), files)) {
        return { env, action: 'skip', reason: 'uploaded', version: manifest.version }
    }
    return { env, action: 'create' }
}

export async function seedRuleset(env: RulesetEnv, files: RulesetDraftFile[]): Promise<string> {
    const manifest = await createVersion({
        env,
        files,
        changeNote: SEED_CHANGE_NOTE,
        author: SEED_AUTHOR,
        source: null,
    })
    return manifest.version
}

export type SeedResult = SeedPlan | { env: RulesetEnv; action: 'created'; version: string }

// Without apply nothing is written, and an environment that would get a version keeps action 'create'.
export async function seedEnvironments(files: RulesetDraftFile[], apply: boolean): Promise<SeedResult[]> {
    const results: SeedResult[] = []
    for (const env of RULESET_ENVS) {
        const plan = await planSeed(env, files)
        const creates = apply && plan.action === 'create'
        results.push(creates ? { env, action: 'created', version: await seedRuleset(env, files) } : plan)
    }
    return results
}

// The JobWorker of the queue's environment runs the gate and moves published.json, as for an SI admin.
export async function requestSeedPublish(version: string): Promise<string> {
    const requestId = crypto.randomUUID()
    await enqueueJob({
        job: 'semgrep-ruleset-change',
        payload: {
            kind: 'publish',
            version,
            requestId,
            requestedBy: SEED_AUTHOR,
            requestedAt: new Date().toISOString(),
        },
    })
    return requestId
}
