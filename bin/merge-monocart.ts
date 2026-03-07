import { access, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { merge } from 'monocart-reporter'
import { testsCoverageSourceFilter } from '../tests/coverage.mjs'

async function getShardReports() {
    try {
        const entries = await readdir(resolve('test-results'), { withFileTypes: true })
        const shardReports = entries
            .filter((entry) => entry.isDirectory() && entry.name.startsWith('e2e-shard-'))
            .map((entry) => resolve('test-results', entry.name, 'index.json'))
            .sort()

        const existingShardReports: string[] = []
        for (const shardReport of shardReports) {
            try {
                await access(shardReport)
                existingShardReports.push(shardReport)
            } catch {
                continue
            }
        }

        return existingShardReports
    } catch {
        return []
    }
}

const shardReports = await getShardReports()

if (!shardReports.length) {
    console.warn('No shard reports found to merge.')
    process.exit(0)
}

await merge(shardReports, {
    name: 'E2E Test Report',
    outputFile: './test-results/e2e/index.html',
    coverage: {
        entryFilter: (entry: { url?: string; source?: string }) => {
            return !!(entry.url?.match(/\/chunks\/src/) && !entry.source?.match(/TURBOPACK_CHUNK_LISTS/))
        },
        sourceFilter: testsCoverageSourceFilter,
        reports: ['raw', 'v8', 'console-summary', ['lcovonly', { file: 'lcov/code-coverage.lcov.info' }]],
    },
})
