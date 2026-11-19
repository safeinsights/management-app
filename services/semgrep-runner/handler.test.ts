import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from '../../tests/unit.helpers'
import { DEADLINE_MARGIN_MS, deadlineSignal, logRun, usesRulesBucket } from './handler.ts'

// Vitest drops a type-only import that lacks `import type`; Node's type stripping does not, and Lambda
// loads the handler with plain Node. Only a real Node process shows that the image will start.
it('loads the Lambda entry point in plain Node', () => {
    const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.mjs')
    const script = "const m = await import(process.argv[1]); process.exit(typeof m.handler === 'function' ? 0 : 1)"
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, entry], { encoding: 'utf-8' })

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
})

describe('deadlineSignal', () => {
    const context = (remaining: number) => ({ getRemainingTimeInMillis: () => remaining })

    it('rejects a Lambda timeout that leaves no time past the margin', () => {
        expect(() => deadlineSignal(context(DEADLINE_MARGIN_MS))).toThrow(/Lambda timeout/)
        expect(() => deadlineSignal(context(10_000))).toThrow(/Lambda timeout/)
    })

    it('gives a run with time past the margin a signal that has not fired', () => {
        expect(deadlineSignal(context(DEADLINE_MARGIN_MS + 60_000)).aborted).toBe(false)
    })
})

describe('usesRulesBucket', () => {
    it('gives the rules bucket to scan and gate runs, not to test runs', () => {
        expect(usesRulesBucket({ mode: 'gate', rulesetVersion: 'v1' })).toBe(true)
        expect(usesRulesBucket({ mode: 'scan', submission: { bucket: 'b', prefix: 'p' }, rulesetVersion: 'v1' })).toBe(
            true,
        )
        expect(usesRulesBucket({ mode: 'test', rules: [], files: [] })).toBe(false)
    })
})

describe('logRun', () => {
    it('logs counts for a gate run, never its failure text', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        logRun(
            {
                mode: 'gate',
                rulesetVersion: 'v1',
                passed: false,
                checks: [
                    { name: 'integrity', passed: true, failures: [] },
                    { name: 'coverage', passed: false, failures: ['corpus/a.R:3: ERROR x fires'], failuresOmitted: 2 },
                ],
            },
            Date.now(),
        )

        const logged = JSON.parse(String(warn.mock.calls[0][0]))
        expect(logged).toMatchObject({ mode: 'gate', passed: false, failures: { integrity: 0, coverage: 3 } })
        expect(logged).not.toHaveProperty('outcome')
        expect(JSON.stringify(logged)).not.toContain('corpus/a.R')
    })
})
