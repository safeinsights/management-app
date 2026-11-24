import { z } from 'zod'
import { RULESET_RULES_DIR, RULESET_TESTS_DIR, type TestRequest } from '../../../services/semgrep-runner/protocol'
import type { RulesetDraftFile } from './schemas'

// The runner's folder for scanned files (SUBMISSION_ROOT in services/semgrep-runner/semgrep.ts).
const SUBMISSION_ROOT = 'src'

// A subfolder keeps a scratch file from pairing with a rule of the same stem in the fixture test.
export const SCRATCH_DIR = '_scratch'

export const scratchFileSchema = z.object({
    name: z
        .string()
        .min(1)
        .max(200)
        .refine((name) => !name.includes('/') && !name.includes('\0') && name !== '.' && name !== '..', 'unsafe name'),
    content: z.string(),
})
export type ScratchFile = z.infer<typeof scratchFileSchema>

const under = (dir: string, path: string) => (path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : null)

// The same layout as a gate: rules/ goes to the runner's rules folder and tests/ to its src folder.
export function buildTestRequest(files: RulesetDraftFile[], scratchFiles: ScratchFile[]): TestRequest {
    const rules: TestRequest['rules'] = []
    const sources: TestRequest['files'] = []
    for (const { path, content } of files) {
        const rule = under(RULESET_RULES_DIR, path)
        if (rule !== null) rules.push({ path: rule, content })
        const test = under(RULESET_TESTS_DIR, path)
        if (test !== null) sources.push({ path: test, content })
    }
    for (const { name, content } of scratchFiles) sources.push({ path: `${SCRATCH_DIR}/${name}`, content })
    return { mode: 'test', rules, files: sources }
}

export type TestRunTarget = { kind: 'ruleset'; path: string } | { kind: 'scratch'; name: string }

// Findings and errors name scanned files relative to src/, while fixture test results keep the src/ and
// rules/ prefixes. Maps any of them back to the ruleset file or scratch file it came from.
export function testRunTarget(runnerPath: string): TestRunTarget {
    if (runnerPath.startsWith(`${RULESET_RULES_DIR}/`)) return { kind: 'ruleset', path: runnerPath }
    const scanned = under(SUBMISSION_ROOT, runnerPath) ?? runnerPath
    const scratch = under(SCRATCH_DIR, scanned)
    if (scratch !== null) return { kind: 'scratch', name: scratch }
    return { kind: 'ruleset', path: `${RULESET_TESTS_DIR}/${scanned}` }
}
