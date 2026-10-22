// OTTER-862: docs/retroactive-changes.md step 5, enforced by .github/workflows/pr-description.yml
export const MIGRATIONS_PREFIX = 'src/database/migrations/'

// Text must follow on the same line: the template's bare "Existing studies:" must not pass. Emphasis
// may close on either side of the colon, and pasted text often carries a non-breaking space.
const FILLED_LINE = /existing studies(?:[^\S\n]|[*_])*:(?:[^\S\n]|[*_`\-\u2013\u2014])*([a-z0-9].*)/gi

// A deferred answer or the template's own placeholder tells QA nothing.
const NON_ANSWER = /^(?:tbd|todo|n\/a)\W*$|<(?:what the migration fills in|why existing rows need nothing)/i

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
    return Array.from(visibleText(body ?? '').matchAll(FILLED_LINE), (m) => m[1]).some(
        (answer) => !NON_ANSWER.test(answer),
    )
}

export function checkPrDescription({ body, changedFiles }) {
    const migrations = changedFiles.filter((f) => f.startsWith(MIGRATIONS_PREFIX))
    if (migrations.length === 0 || hasExistingStudiesLine(body)) return { ok: true }
    return { ok: false, migrations }
}
