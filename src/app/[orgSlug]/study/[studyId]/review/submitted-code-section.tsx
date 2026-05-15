import { Anchor, Divider, Group, Paper, Pill, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOut, CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import {
    getStudyReviewForJob,
    latestCodeScanForStudy,
    type LatestCodeScanForStudy,
    type LatestJobForStudy,
} from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { ScanStatus, StudyJobFileType } from '@/database/types'
import { AiSummaryCollapsible, StudyCodeViewer, type CodeFile } from './submitted-code-interactive'

const CODE_FILE_TYPES: StudyJobFileType[] = ['MAIN-CODE', 'SUPPLEMENTAL-CODE']

function filterAndOrderCodeFiles(files: LatestJobForStudy['files']): CodeFile[] {
    const codeFiles = files.filter((f) => CODE_FILE_TYPES.includes(f.fileType))
    const main = codeFiles.filter((f) => f.fileType === 'MAIN-CODE')
    const supplemental = codeFiles
        .filter((f) => f.fileType === 'SUPPLEMENTAL-CODE')
        .sort((a, b) => a.name.localeCompare(b.name))
    return [...main, ...supplemental].map((f) => ({ name: f.name, fileType: f.fileType }))
}

export type ScannerResult = { name: 'Trivy' | 'SonarQube'; passed: boolean; message: string }

function describeFailedScan(status: ScanStatus | undefined): string {
    if (status === 'SCAN-FAILED') return 'Scan failed — vulnerabilities found'
    if (status === 'SCAN-RUNNING') return 'Scan in progress'
    if (status === 'SCAN-PENDING') return 'Scan pending'
    if (status === undefined) return 'No scan results available'
    return 'Scan status unknown'
}

// TODO(Nathan): codeScan currently stores a single combined Trivy+SonarQube run
// per orgCodeEnv. Until the schema splits per-scanner results, both rows mirror
// the same overall pass/fail status. Confirm display approach at PR review.
export function deriveScanResults(scan: LatestCodeScanForStudy | null): ScannerResult[] {
    const passed = scan?.status === 'SCAN-COMPLETE'
    const failureMessage = describeFailedScan(scan?.status)
    return [
        { name: 'Trivy', passed, message: passed ? 'Scan: no vulnerabilities found' : failureMessage },
        { name: 'SonarQube', passed, message: passed ? 'Quality Gate: OK' : failureMessage },
    ]
}

function SubmittedCodeHeader({ proposalHref }: { proposalHref: string }) {
    return (
        <Group justify="space-between" align="center" wrap="nowrap" data-testid="submitted-code-header">
            <Title order={3} fz={18} fw={700}>
                Submitted code
            </Title>
            <Anchor
                href={proposalHref}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                data-testid="view-approved-initial-request"
            >
                View approved initial request <ArrowSquareOut size={14} />
            </Anchor>
        </Group>
    )
}

function DatasetPills({ names }: { names: string[] }) {
    const pills = names.map((name) => (
        <Pill key={name} size="md" data-testid="submitted-code-dataset-pill">
            {name}
        </Pill>
    ))
    const empty = (
        <Text size="sm" c="dimmed" data-testid="submitted-code-datasets-empty">
            No datasets associated
        </Text>
    )
    return (
        <Stack gap="xs" data-testid="submitted-code-datasets">
            <Text size="sm">Dataset(s) associated with the study</Text>
            <Group gap="xs">{names.length === 0 ? empty : pills}</Group>
        </Stack>
    )
}

function SecurityScanRow({ result }: { result: ScannerResult }) {
    const Icon = result.passed ? CheckCircle : XCircle
    const colorVar = `var(--mantine-color-${result.passed ? 'green' : 'red'}-6)`
    const dataIcon = result.passed ? 'pass' : 'fail'
    return (
        <Group gap="xs" wrap="nowrap" data-testid={`scan-row-${result.name.toLowerCase()}`}>
            <Icon size={20} weight="fill" color={colorVar} data-icon={dataIcon} aria-hidden="true" />
            <Text size="sm">
                <strong>{result.name}:</strong> {result.message}
            </Text>
        </Group>
    )
}

function SecurityScanLog({ results }: { results: ScannerResult[] }) {
    const rows = results.map((r) => <SecurityScanRow key={r.name} result={r} />)
    return (
        <Stack gap="xs" data-testid="security-scan-log">
            <Text fw={700}>Security scan log</Text>
            {rows}
        </Stack>
    )
}

type SubmittedCodeSectionProps = {
    orgSlug: string
    study: SelectedStudy
    job: Pick<LatestJobForStudy, 'id' | 'files'>
}

export async function SubmittedCodeSection({ orgSlug, study, job }: SubmittedCodeSectionProps) {
    const [review, codeScan] = await Promise.all([getStudyReviewForJob(job.id), latestCodeScanForStudy(study.id)])
    const datasetNames = (study.orgDataSources ?? []).map((ds) => ds.name)
    const proposalHref = `${Routes.studyReview({ orgSlug, studyId: study.id })}?from=code-review`
    const scanResults = deriveScanResults(codeScan)
    const summary = review?.report.codeExplanation ?? null
    const codeFiles = filterAndOrderCodeFiles(job.files)

    return (
        <Paper p="xxl" data-testid="submitted-code-section">
            <Stack gap="md">
                <SubmittedCodeHeader proposalHref={proposalHref} />
                <Divider />
                <DatasetPills names={datasetNames} />
                <Divider />
                <Group align="flex-start" grow gap="xl" wrap="nowrap">
                    <AiSummaryCollapsible summary={summary} />
                    <SecurityScanLog results={scanResults} />
                </Group>
                <Divider />
                <StudyCodeViewer files={codeFiles} />
            </Stack>
        </Paper>
    )
}
