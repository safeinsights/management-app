// Reproduces @clerk/shared@3.47.6 createPathMatcher. `[param]` is LITERAL text, not a wildcard,
// so the proxy's isOrgRoute checks stay inert on real URLs and avoid a /dashboard redirect loop.

const GROUP = '\x00G'

export function patternToRegExp(pattern: string): RegExp {
    // Pull out `(...)` groups so their contents aren't escaped, then restore them after.
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
