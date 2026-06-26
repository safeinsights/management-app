import { CoverageReport, type CoverageReportOptions } from 'monocart-coverage-reports'
import { testsCoverageSourceFilter } from './coverage.mjs'

const coverageOptions: CoverageReportOptions = {
    name: 'Coverage Report',
    // Both inputs hold the same { id, type:'v8', data } shape monocart merges. Unit raw
    // V8 comes from vitest-monocart's .cache, staged into raw/ by CI (locally, point
    // straight at .cache); e2e raw comes from the Playwright monocart reporter. Missing
    // dirs are tolerated (a job may not have produced coverage) — monocart skips them.
    inputDir: ['./test-results/unit/raw', './test-results/unit/.cache', './test-results/e2e/coverage/raw'],
    outputDir: './test-results/coverage',
    sourceFilter: testsCoverageSourceFilter,
    clean: true,
    reports: ['markdown-summary', 'markdown-details', 'console-details', 'json-summary', 'html'],
}

await new CoverageReport(coverageOptions).generate()
