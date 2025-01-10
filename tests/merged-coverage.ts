import { CoverageReport, type CoverageReportOptions } from 'monocart-coverage-reports'
import { testsCoverageSourceFilter } from './coverage.mjs'

const coverageOptions: CoverageReportOptions = {
    name: 'Merged Coverage Report',
    inputDir: ['./tmp/code-coverage/unit/raw', './tmp/code-coverage/e2e/raw'],
    outputDir: './tmp/code-coverage/merged',
    sourceFilter: testsCoverageSourceFilter,
    clean: true,
    reports: ['markdown-summary', 'markdown-details', 'console-details', 'html'],
}

await new CoverageReport(coverageOptions).generate()
