// OTTER-862: docs/retroactive-changes.md step 5, enforced by .github/workflows/pr-description.yml
export const MIGRATIONS_PREFIX = 'src/database/migrations/'

// Text must follow on the same line: the template's bare "Existing studies:" must not pass.
const FILLED_LINE = /existing studies[ \t]*:[ \t*_]*[a-z0-9]/i

export function hasExistingStudiesLine(body) {
    return FILLED_LINE.test((body ?? '').replace(/<!--[\s\S]*?-->/g, ''))
}

export function checkPrDescription({ body, changedFiles }) {
    const migrations = changedFiles.filter((f) => f.startsWith(MIGRATIONS_PREFIX))
    if (migrations.length === 0 || hasExistingStudiesLine(body)) return { ok: true }
    return { ok: false, migrations }
}
