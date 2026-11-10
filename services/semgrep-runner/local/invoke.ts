// Run by run-local inside the runner image: builds the request from the mounted folders, invokes the
// runner in the Lambda emulator, prints the response JSON on stdout and a summary on stderr.
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { RunnerResponse, TestResponse } from '../protocol.ts'

// The runner's own copy inside the image, so this script picks rule files exactly as the runner does.
const PROTOCOL_IN_IMAGE = '/var/task/services/semgrep-runner/protocol.ts'
const { isRuleFile } = (await import(PROTOCOL_IN_IMAGE)) as { isRuleFile: (file: string) => boolean }

const [mode, host] = process.argv.slice(2)
const MAX_REQUEST_BYTES = 6 * 1024 * 1024

type FunctionError = { errorType?: string; errorMessage?: string }
type Reply = RunnerResponse & FunctionError

function readTree(root: string) {
    return fs
        .readdirSync(root, { recursive: true, encoding: 'utf-8' })
        .filter((relative) => fs.statSync(path.join(root, relative)).isFile())
        .sort()
        .map((relative) => ({
            path: relative.split(path.sep).join('/'),
            content: fs.readFileSync(path.join(root, relative), 'utf-8'),
        }))
}

function buildRequest() {
    if (mode === 'scan') {
        return { mode: 'scan', submission: { bucket: 'local', prefix: 'submission' }, rulesetVersion: 'local' }
    }
    const rules = readTree('/in/rules').filter((file) => isRuleFile(file.path))
    const files = readTree('/in/files')
    if (!rules.length)
        throw new Error('The rules folder holds no rule file (.yaml or .yml, not *.test.yaml, no dot-name)')
    if (!files.length) throw new Error('The test files folder is empty')
    return { mode: 'test', rules, files }
}

async function invoke(body: string): Promise<Response> {
    const url = `http://${host}:8080/2015-03-31/functions/function/invocations`
    for (let attempt = 1; ; attempt++) {
        try {
            return await fetch(url, { method: 'POST', body })
        } catch (error) {
            // The emulator needs a moment to listen after the container starts.
            if (attempt >= 60) throw error
            await new Promise((resolve) => setTimeout(resolve, 1000))
        }
    }
}

function testLines(response: TestResponse, parts: string[], seconds: string): string[] {
    parts.push(`${response.findings.length} findings`, `${response.errors.length} errors`)
    if (response.findingsOmitted) parts.push(`${response.findingsOmitted} findings left out`)
    if (!response.tests) return [`${parts.join(', ')}, ${seconds}`, `  no fixture test results: ${response.testsError}`]
    const { tests } = response
    const checks = Object.entries(tests.results).flatMap(([file, result]) =>
        Object.entries(result.checks).map(([id, check]) => ({ file, id, passed: check.passed })),
    )
    parts.push(`checks ${checks.filter((check) => check.passed).length}/${checks.length} passed`)
    return [
        `${parts.join(', ')}, ${seconds}`,
        ...checks.filter((check) => !check.passed).map((check) => `  failed check: ${check.file}: ${check.id}`),
        ...tests.config_missing_tests.map((file) => `  rule file without a test file: ${file}`),
        ...tests.config_with_errors.map((entry) => `  rule file with errors: ${entry.filename}`),
    ]
}

function summarize(response: Reply, ms: number): string[] {
    const seconds = `${(ms / 1000).toFixed(1)} s`
    if (response.errorType || response.errorMessage) {
        return [`Function error after ${seconds}: ${response.errorType}`, String(response.errorMessage)]
    }
    const parts = [`mode ${response.mode}`, `outcome ${response.outcome}`]
    if (response.error) parts.push(`error ${response.error}`)
    if (response.mode === 'scan' && response.semgrepJsonOmitted) parts.push('semgrep.json left out (too large)')
    const lines = response.mode === 'test' ? testLines(response, parts, seconds) : [`${parts.join(', ')}, ${seconds}`]
    return [...lines, '', response.log]
}

const body = JSON.stringify(buildRequest())
if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
    console.error(`Warning: the request is ${Buffer.byteLength(body)} bytes; Lambda refuses a request over 6 MB.`)
}
const started = Date.now()
const res = await invoke(body)
const text = await res.text()
const ms = Date.now() - started
process.stdout.write(text)
let response: Reply
try {
    response = JSON.parse(text) as Reply
} catch {
    console.error(`The emulator returned no JSON (HTTP ${res.status}).`)
    process.exit(1)
}
console.error(summarize(response, ms).join('\n'))
process.exit(response.errorType || response.errorMessage ? 1 : 0)
