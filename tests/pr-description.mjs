// OTTER-862: docs/retroactive-changes.md step 5, enforced by .github/workflows/pr-description.yml
export const MIGRATIONS_PREFIX = 'src/database/migrations/'

// Text must follow on the same line: the template's bare "Existing studies:" must not pass.
const FILLED_LINE = /existing studies[ \t]*:[ \t*_]*[a-z0-9]/i

// The text GitHub shows: an unclosed "<!--" hides everything after it, so it drops the rest.
function visibleText(body) {
    let visible = ''
    let rest = body
    for (let start = rest.indexOf('<!--'); start !== -1; start = rest.indexOf('<!--')) {
        visible += rest.slice(0, start)
        const end = rest.indexOf('-->', start + 4)
        rest = end === -1 ? '' : rest.slice(end + 3)
    }
    return visible + rest
}

export function hasExistingStudiesLine(body) {
    return FILLED_LINE.test(visibleText(body ?? ''))
}

export function checkPrDescription({ body, changedFiles }) {
    const migrations = changedFiles.filter((f) => f.startsWith(MIGRATIONS_PREFIX))
    if (migrations.length === 0 || hasExistingStudiesLine(body)) return { ok: true }
    return { ok: false, migrations }
}
