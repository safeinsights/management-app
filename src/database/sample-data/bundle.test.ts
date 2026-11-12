import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from '@/tests/unit.helpers'

// Same flags as buildDBCode in iac/cicd/management-app/scripts/funcs.ts, which bundles each seed
// alone for the migrator Lambda. The banner lets CJS dependencies such as the AWS SDK require Node
// builtins from ESM. vitest's own loader hides bundle failures, so this imports from plain ESM.
const MIGRATOR_ESBUILD_FLAGS = [
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--log-level=warning',
    "--banner:js=import { createRequire as __seedCreateRequire } from 'node:module'; const require = __seedCreateRequire(import.meta.url);",
]

describe('sample studies seed bundle', () => {
    it('imports cleanly as the ESM bundle the migrator Lambda runs', () => {
        const dir = mkdtempSync(join(tmpdir(), 'sample-seed-'))
        const outfile = join(dir, 'seed.mjs')
        execFileSync('pnpm', [
            'exec',
            'esbuild',
            ...MIGRATOR_ESBUILD_FLAGS,
            `--outfile=${outfile}`,
            'src/database/seeds/1793200000000_sample_studies.ts',
        ])
        const runner = join(dir, 'runner.mjs')
        writeFileSync(runner, "import { seed } from './seed.mjs'\nconsole.log(typeof seed)\n")

        expect(execFileSync('node', [runner]).toString().trim()).toBe('function')
    })
})
