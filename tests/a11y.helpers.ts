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

type ScanOptions = {
    include?: string
    // Text in the rows this test seeded. Other workers seed rows into the same tables in parallel,
    // so their rows are left out and every run scans the same input.
    onlyRowsWith?: string
}

// `include` only narrows what is scanned. Apart from other workers' rows, nothing can be excluded.
export async function scanA11y(page: Page, label: string, { include, onlyRowsWith }: ScanOptions = {}) {
    const builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS, 'best-practice'])
    if (include) builder.include(include)
    if (onlyRowsWith) {
        await page
            .locator('tbody tr')
            .filter({ hasNotText: onlyRowsWith })
            .evaluateAll((rows) => rows.forEach((row) => row.setAttribute('data-a11y-other-worker', '')))
        builder.exclude('[data-a11y-other-worker]')
    }
    const results = await builder.analyze()
    const json = JSON.stringify(results, null, 2)
    await fs.promises.writeFile(test.info().outputPath(`axe-${label.replace(/\W+/g, '-').toLowerCase()}.json`), json)
    // A body, not a path: attaching a path copies the file next to it, and CI would upload both.
    await test.info().attach(`axe: ${label}`, { body: json, contentType: 'application/json' })
    return {
        wcag: results.violations.filter(isWcagViolation),
        bestPractice: results.violations.filter((violation) => !isWcagViolation(violation)),
    }
}

export async function expectNoA11yViolations(page: Page, label: string, options?: ScanOptions) {
    const { wcag } = await scanA11y(page, label, options)
    expect(wcag.map(describeViolation), `WCAG A/AA violations on ${label}`).toEqual([])
}
