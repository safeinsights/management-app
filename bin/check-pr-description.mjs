#!/usr/bin/env node
// Usage: git diff --name-only HEAD^1 HEAD | PR_BODY="..." node bin/check-pr-description.mjs
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { MIGRATIONS_PREFIX, checkPrDescription } from '../tests/pr-description.mjs'

const changedFiles = readFileSync(0, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
const result = checkPrDescription({ body: process.env.PR_BODY, changedFiles })

if (result.ok) {
    const required = changedFiles.some((f) => f.startsWith(MIGRATIONS_PREFIX))
    process.stdout.write(`Existing studies line: ${required ? 'present' : 'not required (no migration changes)'}\n`)
} else {
    process.stdout.write(
        `::error title=Existing studies line missing::This PR changes ${result.migrations.join(', ')}. ` +
            'Add "Existing studies: backfilled <what>" or "Existing studies: unaffected because <why>" to the PR ' +
            'description (docs/retroactive-changes.md, step 5). Editing the description re-runs this check.\n',
    )
    process.exitCode = 1
}
