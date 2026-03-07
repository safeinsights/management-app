import { access, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { merge } from 'monocart-reporter'
import { testsCoverageSourceFilter } from '../tests/coverage.mjs'

type ReportRow = {
    title?: string
    type?: string
    suiteType?: string
    caseType?: string
    outcome?: string
    status?: string
    retry?: number
    location?: string
    annotations?: string[]
    subs?: ReportRow[]
}

type InterestingCase = {
    shardLabel: string
    outcome: string
    retry: number
    title: string
    location: string
}

function visitRows(rows: ReportRow[], visitor: (row: ReportRow) => void) {
    for (const row of rows) {
        visitor(row)
        if (row.subs?.length) {
            visitRows(row.subs, visitor)
        }
    }
}

function mergeAnnotations(row: ReportRow, values: string[]) {
    const existingAnnotations = Array.isArray(row.annotations) ? row.annotations : []
    const mergedAnnotations = new Set(existingAnnotations)
    for (const value of values) {
        mergedAnnotations.add(value)
    }
    row.annotations = [...mergedAnnotations]
}

function getShardCounts(rows: ReportRow[]) {
    const counts = {
        failed: 0,
        flaky: 0,
        retries: 0,
    }

    visitRows(rows, (row) => {
        if (row.type !== 'case') return

        if (row.caseType === 'flaky' || row.outcome === 'flaky') {
            counts.flaky += 1
        }

        if (row.status === 'failed') {
            counts.failed += 1
        }

        if ((row.retry ?? 0) > 0) {
            counts.retries += 1
        }
    })

    return counts
}

function annotateInterestingCases(rows: ReportRow[], shardLabel: string) {
    visitRows(rows, (row) => {
        if (row.type !== 'case') return

        const annotations = [shardLabel]
        if (row.caseType === 'flaky' || row.outcome === 'flaky') {
            annotations.push('flaky')
        }
        if (row.status === 'failed') {
            annotations.push('failed')
        }
        if ((row.retry ?? 0) > 0) {
            annotations.push(`retry:${row.retry}`)
        }

        if (annotations.length > 1) {
            mergeAnnotations(row, annotations)
        }
    })
}

function getInterestingCases(rows: ReportRow[]): InterestingCase[] {
    const interestingCases: InterestingCase[] = []

    for (const [index, row] of rows.entries()) {
        if (row.suiteType !== 'shard') continue

        const shardLabel = `shard-${index + 1}`
        visitRows(row.subs ?? [], (childRow) => {
            if (childRow.type !== 'case') return

            const isFlaky = childRow.caseType === 'flaky' || childRow.outcome === 'flaky'
            const isFailed = childRow.status === 'failed'
            if (!isFlaky && !isFailed) return

            interestingCases.push({
                shardLabel,
                outcome: childRow.outcome ?? childRow.status ?? 'unknown',
                retry: childRow.retry ?? 0,
                title: childRow.title ?? 'Untitled test',
                location: childRow.location ?? 'unknown location',
            })
        })
    }

    return interestingCases
}

function enrichMergedRows(rows: ReportRow[]) {
    for (const [index, row] of rows.entries()) {
        if (row.suiteType !== 'shard') continue

        const shardLabel = `shard-${index + 1}`
        const originalTitle = row.title ?? 'unknown-host'
        const counts = getShardCounts(row.subs ?? [])

        row.title = `${shardLabel} (${originalTitle})`

        const shardAnnotations = [shardLabel]
        if (counts.flaky) {
            shardAnnotations.push(`flaky:${counts.flaky}`)
        }
        if (counts.failed) {
            shardAnnotations.push(`failed:${counts.failed}`)
        }
        if (counts.retries) {
            shardAnnotations.push(`retries:${counts.retries}`)
        }
        mergeAnnotations(row, shardAnnotations)
        annotateInterestingCases(row.subs ?? [], shardLabel)
    }
}

function makeInterestingColumnsSearchable(defaultColumns: Array<{ id?: string; searchable?: boolean }>) {
    for (const column of defaultColumns) {
        if (!column.id) continue
        if (['status', 'outcome', 'location'].includes(column.id)) {
            column.searchable = true
        }
    }
}

function logInterestingCases(rows: ReportRow[]) {
    const interestingCases = getInterestingCases(rows)
    if (!interestingCases.length) return

    console.warn('Merged shard failures and flakies:')
    for (const item of interestingCases) {
        console.warn(`- [${item.shardLabel}] ${item.outcome} retry=${item.retry} ${item.title} (${item.location})`)
    }
}

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
    columns: makeInterestingColumnsSearchable,
    coverage: {
        entryFilter: (entry: { url?: string; source?: string }) => {
            return !!(entry.url?.match(/\/chunks\/src/) && !entry.source?.match(/TURBOPACK_CHUNK_LISTS/))
        },
        sourceFilter: testsCoverageSourceFilter,
        reports: ['raw', 'v8', 'console-summary', ['lcovonly', { file: 'lcov/code-coverage.lcov.info' }]],
    },
    onData: async (reportData) => {
        enrichMergedRows(reportData.rows ?? [])
    },
    onEnd: async (reportData) => {
        logInterestingCases(reportData.rows ?? [])
    },
})
