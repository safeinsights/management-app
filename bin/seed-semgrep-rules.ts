#!/usr/bin/env -S pnpm exec tsx
/* eslint-disable no-console */

// One-time seed of the Semgrep rules bucket from the rules in iac (OTTER-910).
//
// upload: with si-devops credentials, writes the iac rules, their fixtures and the research code
// corpus as a new version under every rulesets/<env>/ prefix. An environment with a published
// version, or with a complete latest version, is left alone. It never writes published.json.
//
// publish: with one environment's credentials and its JOB_QUEUE_URL, queues the gated publish of that
// version in that environment's JobWorker, which refuses a version that is not newer than the
// published one. The outcome is in rulesets/<env>/requests/<id>.json, and in the next upload dry run.
//
// Usage: AWS_PROFILE=si-devops pnpm semgrep:seed upload --iac <iac checkout> --corpus <dir>... [--apply]
//        AWS_PROFILE=<env> JOB_QUEUE_URL=<url> pnpm semgrep:seed publish [--version v1] [--apply]
// A dry run, with no writes, unless --apply is given.

import path from 'node:path'
import { parseArgs } from 'node:util'
import { readSeedFiles, requestSeedPublish, seedEnvironments, type SeedResult } from '@/server/semgrep-rulesets/seed'
import { rulesetVersionSchema } from '../services/semgrep-runner/protocol'

const IAC_RULES_DIR = 'management-app/codebuild/scripts/semgrep-rules'
const IAC_TESTS_DIR = 'management-app/codebuild/semgrep-tests'

process.env.SEMGREP_RULES_BUCKET ||= 'si-semgrep-rules'
process.env.SEMGREP_RULES_BUCKET_OWNER ||= '432772479668'
// The store config needs an environment, but each call below names its own.
process.env.SEMGREP_RULESET_ENV ||= 'dev'

function describe(result: SeedResult) {
    if (result.action === 'create') return 'would upload a new version'
    if (result.action === 'created') return `uploaded ${result.version}`
    return `${result.version} is ${result.reason}, left alone`
}

async function upload(iac: string | undefined, corpusDirs: string[], apply: boolean) {
    if (!iac || !corpusDirs.length) throw new Error('upload needs --iac and at least one --corpus')
    const files = readSeedFiles({
        rulesDir: path.join(iac, IAC_RULES_DIR),
        testsDir: path.join(iac, IAC_TESTS_DIR),
        corpusDirs,
    })
    for (const file of files) console.log(`  ${file.path}`)
    console.log(`${files.length} files${apply ? '' : ' (dry run, pass --apply to write)'}`)

    for (const result of await seedEnvironments(files, apply)) console.log(`${result.env}: ${describe(result)}`)
}

async function publish(version: string, apply: boolean) {
    rulesetVersionSchema.parse(version)
    const queue = process.env.JOB_QUEUE_URL
    if (!queue) throw new Error('publish needs JOB_QUEUE_URL, the job queue of the environment')
    if (!apply) {
        console.log(`would queue the publish of ${version} on ${queue} (dry run, pass --apply to send)`)
        return
    }
    console.log(`queued the publish of ${version} as request ${await requestSeedPublish(version)}`)
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            iac: { type: 'string' },
            corpus: { type: 'string', multiple: true, default: [] },
            version: { type: 'string', default: 'v1' },
            apply: { type: 'boolean', default: false },
        },
    })
    const [command] = positionals
    if (command === 'upload') return upload(values.iac, values.corpus, values.apply)
    if (command === 'publish') return publish(values.version, values.apply)
    throw new Error('expected a command: upload or publish')
}

main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
})
