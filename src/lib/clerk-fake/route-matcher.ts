// E2E Clerk fake — route matcher (pure, no server deps so it's unit-testable).
//
// Reproduces the observable behavior of @clerk/shared's createPathMatcher (which runs
// each pattern through path-to-regexp) for the constructs src/proxy.ts uses:
//   - `(.*)` and `(a|b|c)` groups are preserved as regex groups
//   - `[param]` is treated as LITERAL text (path-to-regexp does NOT treat [..] as a
//     wildcard — `/[orgSlug]` only matches the literal string "/[orgSlug]", so the
//     proxy's isOrgRoute/isOrgAdminRoute checks are effectively inert on real URLs;
//     we must match that to avoid a /dashboard redirect loop)
//   - a trailing optional `/`, `#`, or `?` is allowed, matching path-to-regexp output
//
// Verified against @clerk/shared@3.47.6 pathToRegexp:
//   /[orgSlug]                                  => /^\/\[orgSlug\][\/#\?]?$/i
//   /[orgSlug]/admin/(.*)                       => /^\/\[orgSlug\]\/admin(?:\/(.*))[\/#\?]?$/i
//   /researcher(.*)                             => /^\/researcher(.*)[\/#\?]?$/i
//   /(admin|dl|reviewer|researcher|organization)(.*) => /^(?:\/(admin|...))(.*)[\/#\?]?$/i

const GROUP = '\x00G'

export function patternToRegExp(pattern: string): RegExp {
    // Pull out `(...)` groups so their contents aren't escaped, then escape the literal
    // remainder (including `[param]`, which is literal), then restore the groups.
    const groups: string[] = []
    let working = pattern.replace(/\([^)]*\)/g, (g) => {
        groups.push(g)
        return `${GROUP}${groups.length - 1}\x00`
    })

    working = working.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const source = working.replace(new RegExp(`${GROUP}(\\d+)\\x00`, 'g'), (_, i) => groups[Number(i)])

    return new RegExp(`^${source}[/#?]?$`, 'i')
}

export function buildRouteMatcher(patterns: string[]): (pathname: string) => boolean {
    const regexps = patterns.map(patternToRegExp)
    return (pathname: string) => regexps.some((re) => re.test(pathname))
}
