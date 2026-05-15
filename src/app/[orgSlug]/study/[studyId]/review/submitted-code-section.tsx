import { Anchor, Divider, Group, Paper, Pill, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOut, CheckCircle, CircleNotch, XCircle } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import type { JobScanResult, JobScanStatus, LatestJobForStudy, StudyReviewWithMeta } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { StudyJobFileType } from '@/database/types'
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

function ScanStatusIcon({ status }: { status: JobScanStatus }) {
    if (status === 'PASSED') {
        return (
            <CheckCircle
                size={20}
                weight="fill"
                color="var(--mantine-color-green-6)"
                data-icon="pass"
                aria-hidden="true"
            />
        )
    }
    if (status === 'FAILED') {
        return (
            <XCircle size={20} weight="fill" color="var(--mantine-color-red-6)" data-icon="fail" aria-hidden="true" />
        )
    }
    return <CircleNotch size={20} color="var(--mantine-color-charcoal-6)" data-icon="in-progress" aria-hidden="true" />
}

function ScanLogBody({ scan }: { scan: JobScanResult }) {
    if (scan.logFile) {
        return (
            <Text size="sm" data-testid="security-scan-log-file">
                Scan log: {scan.logFile.name}
            </Text>
        )
    }
    if (scan.status === 'IN-PROGRESS') {
        return (
            <Text size="sm" c="dimmed" data-testid="security-scan-log-pending">
                Scan in progress…
            </Text>
        )
    }
    return (
        <Text size="sm" c="dimmed" data-testid="security-scan-log-empty">
            No scan log available.
        </Text>
    )
}

function SecurityScanLog({ scan }: { scan: JobScanResult }) {
    return (
        <Stack gap="xs" data-testid="security-scan-log">
            <Group gap="xs" wrap="nowrap">
                <Text fw={700}>Security scan log</Text>
                <ScanStatusIcon status={scan.status} />
            </Group>
            <ScanLogBody scan={scan} />
        </Stack>
    )
}

type SubmittedCodeSectionProps = {
    orgSlug: string
    study: SelectedStudy
    job: Pick<LatestJobForStudy, 'id' | 'files'>
    review: StudyReviewWithMeta | null
    scan: JobScanResult
}

// Data fetching lives in the parent (CodeReviewRedesignView) so this component
// stays a plain sync function. Nested async server components don't render
// under testing-library / happy-dom — the parent's await is what tests rely on.
export function SubmittedCodeSection({ orgSlug, study, job, review, scan }: SubmittedCodeSectionProps) {
    const datasetNames = study.orgDataSources.map((ds) => ds.name)
    const proposalHref = `${Routes.studyReview({ orgSlug, studyId: study.id })}?from=code-review`
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
                    <SecurityScanLog scan={scan} />
                </Group>
                <Divider />
                <StudyCodeViewer files={codeFiles} />
            </Stack>
        </Paper>
    )
}
