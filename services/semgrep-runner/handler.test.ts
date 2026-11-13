import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from '../../tests/unit.helpers'
import { DEADLINE_MARGIN_MS, deadlineSignal } from './handler.ts'

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
