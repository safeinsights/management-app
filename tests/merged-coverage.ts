import { CoverageReport, type CoverageReportOptions } from 'monocart-coverage-reports'
import { testsCoverageSourceFilter } from './coverage.mjs'

const coverageOptions: CoverageReportOptions = {
    name: 'Coverage Report',
    // vitest-monocart writes its raw V8 coverage to `.cache` (it doesn't emit a `raw/`
    // dir the way the Playwright monocart reporter does), so read that for unit; e2e uses
    // `raw/`. Both hold the same { id, type:'v8', data } shape monocart merges.
    inputDir: ['./test-results/unit/.cache', './test-results/e2e/coverage/raw'],
    outputDir: './test-results/coverage',
    sourceFilter: testsCoverageSourceFilter,
    clean: true,
    reports: ['markdown-summary', 'markdown-details', 'console-details', 'json-summary', 'html'],
}

await new CoverageReport(coverageOptions).generate()
