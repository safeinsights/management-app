import type { StudySpec } from './spec'

export const IMPACTS = [
    'Instructors could adjust course design with evidence instead of vibes.',
    'Students could get study advice that does not start with "it depends".',
    'Textbook authors could finally learn which pages people actually read.',
]

const APPROVAL_NOTES = [
    'Approved. The data request is narrow and the questions are clear.',
    'Approved. Thank you for asking for aggregates only.',
    'Approved. We enjoyed the title more than we should have.',
]

export const approvalNote = (n: number) => APPROVAL_NOTES[n % APPROVAL_NOTES.length]

export const mainFileName = (spec: StudySpec) => (spec.language === 'R' ? 'main.r' : 'main.py')
export const helperFileName = (spec: StudySpec) => (spec.language === 'R' ? 'helpers.r' : 'helpers.py')

export function mainCode(spec: StudySpec) {
    if (spec.language === 'R') {
        return [
            'source("libraries/safeinsights_common.R")',
            'source("helpers.r")',
            '',
            'initialize()',
            `# ${spec.title}`,
            'data <- read.csv("data.csv")',
            'weekly <- aggregate_by_week(data)',
            '# Small cells are suppressed. We are curious, not reckless.',
            'write.csv(suppress_small_cells(weekly), "results.csv", row.names = FALSE)',
            '',
        ].join('\n')
    }
    return [
        'from safeinsights import initialize',
        'from helpers import aggregate_by_week, suppress_small_cells',
        '',
        'initialize()',
        `# ${spec.title}`,
        'data = load_dataset("data.csv")',
        'weekly = aggregate_by_week(data)',
        '# Small cells are suppressed. We are curious, not reckless.',
        'suppress_small_cells(weekly).to_csv("results.csv", index=False)',
        '',
    ].join('\n')
}

export function helperCode(spec: StudySpec) {
    if (spec.language === 'R') {
        return [
            'aggregate_by_week <- function(data) aggregate(value ~ week, data = data, FUN = mean)',
            'suppress_small_cells <- function(df, min_n = 5) df[df$n >= min_n, ]',
            '',
        ].join('\n')
    }
    return [
        'def aggregate_by_week(data):',
        '    return data.groupby("week").agg(n=("value", "size"), mean=("value", "mean")).reset_index()',
        '',
        'def suppress_small_cells(df, min_n=5):',
        '    return df[df["n"] >= min_n]',
        '',
    ].join('\n')
}

export const scanLog = (spec: StudySpec) =>
    // The scan panel reads its verdict from the first line only.
    ['Semgrep scan: no findings', `Scanned "${spec.title}"`, 'Rules checked: 42', ''].join('\n')

export const resultFiles = (spec: StudySpec) => [
    { name: 'results.csv', content: 'week,n,mean\n1,128,0.71\n2,131,0.68\n3,119,0.74\n' },
    { name: 'summary.txt', content: `${spec.title}\nThree weeks, no surprises, one mild existential crisis.\n` },
]

export const runLog = (spec: StudySpec) => [
    {
        name: 'code-run-log.txt',
        content: `Running ${spec.title}\nError in read.csv("data.csv"): object 'font_size' not found\nExecution halted\n`,
    },
]

// In prod a background task writes this; without it the reviewer screen keeps polling for a summary.
export const aiReport = (spec: StudySpec) => ({
    proposalSummary: `The study asks: ${spec.question}`,
    codeExplanation:
        'The code reads the activity data, groups it by week, and suppresses cells with fewer than five students.',
    resultsSummary: 'Weekly aggregates only. No row-level data leaves the enclave.',
    alignmentCheck: { isAligned: true, findings: [] },
    complianceCheck: { isCompliant: true, findings: [] },
})

// tests/assets/empty.pdf, embedded because the migrator Lambda has no repo checkout.
export const AGREEMENT_PDF = Uint8Array.from(
    atob(
        'JVBERi0xLjUKNCAwIG9iajw8L1R5cGUvWFJlZi9TaXplIDUvUm9vdCAxIDAgUi9MZW5ndGggMjAvV1sxIDEgMl0+PnN0cmVhbQoAAP//AXAAAAGbAAABzAAAAQkAAAplbmRzdHJlYW0KZW5kb2JqCjEgMCBvYmo8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PmVuZG9iagoyIDAgb2JqPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj5lbmRvYmoKMyAwIG9iajw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIvUmVzb3VyY2VzPDw+Pi9NZWRpYUJveFswIDAgOSA5XT4+ZW5kb2JqCnN0YXJ0eHJlZgo5CiUlRU9G',
    ),
    (char) => char.charCodeAt(0),
)
