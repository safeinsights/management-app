import AxeBuilder from '@axe-core/playwright'
import { expect, fs, test, type Page } from './e2e.helpers'

// RISK-157 is WCAG 2.1/2.2 A and AA. axe-core has no wcag22a tag; 2.2's A criteria live under the older tags.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>
type AxeViolation = AxeResults['violations'][number]

const isWcagViolation = (violation: AxeViolation) => violation.tags.some((tag) => WCAG_TAGS.includes(tag))

const describeViolation = (violation: AxeViolation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(' ')),
})

// `include` only narrows what is scanned; there is deliberately no way to exclude anything.
export async function scanA11y(page: Page, label: string, { include }: { include?: string } = {}) {
    const builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS, 'best-practice'])
    if (include) builder.include(include)
    const results = await builder.analyze()
    const file = test.info().outputPath(`axe-${label.replace(/\W+/g, '-').toLowerCase()}.json`)
    await fs.promises.writeFile(file, JSON.stringify(results, null, 2))
    await test.info().attach(`axe: ${label}`, { path: file, contentType: 'application/json' })
    return {
        wcag: results.violations.filter(isWcagViolation),
        bestPractice: results.violations.filter((violation) => !isWcagViolation(violation)),
    }
}

export async function expectNoA11yViolations(page: Page, label: string, options?: { include?: string }) {
    const { wcag } = await scanA11y(page, label, options)
    expect(wcag.map(describeViolation), `WCAG A/AA violations on ${label}`).toEqual([])
}
