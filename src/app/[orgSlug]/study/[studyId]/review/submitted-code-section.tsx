import { Anchor, Divider, Group, Paper, Pill, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOut, DownloadSimple, WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import { scanLogDownloadURL } from '@/lib/paths'
import type { JobScanResult, ScanToolStatus, LatestJobForStudy, StudyReviewWithMeta } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { AiSummaryCollapsible, StudyCodeViewer } from './submitted-code-interactive'
import { filterAndOrderCodeFiles } from './study-code-files'

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
                display="inline-flex"
                style={{ alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}
                data-testid="view-approved-initial-request"
            >
                View approved initial request
                <ArrowSquareOut size={14} />
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
            <Text size="sm" fw={700}>
                Dataset(s) associated with the study
            </Text>
            <Group gap="xs">{names.length === 0 ? empty : pills}</Group>
        </Stack>
    )
}

type ScanRowProps = {
    label: string
    status: ScanToolStatus | null
    passedLabel: string
    failedLabel: string
    testId: string
}

function ScanWarningIcon({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <WarningCircle size={20} color="var(--mantine-color-red-9)" data-icon="warning" aria-hidden="true" />
}

// A tool's result: plain text when it passed, otherwise a warning icon paired
// with the failure phrasing. Deliberately no "pass" icon; we only flag the
// results that need a human to look (OTTER-649).
function ScanRow({ label, status, passedLabel, failedLabel, testId }: ScanRowProps) {
    const passed = status === 'PASSED'
    return (
        <Group gap="xs" wrap="nowrap" align="center" data-testid={testId}>
            <Text size="sm">{label}</Text>
            <Group gap={4} wrap="nowrap" align="center">
                <ScanWarningIcon isVisible={!passed} />
                <Text size="sm" fw={600}>
                    {passed ? passedLabel : failedLabel}
                </Text>
            </Group>
        </Group>
    )
}

function ScanLogDownload({ jobId, isVisible }: { jobId: string; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Anchor
            href={scanLogDownloadURL(jobId)}
            download
            size="sm"
            fw={600}
            display="inline-flex"
            style={{ alignItems: 'center', gap: 4, width: 'fit-content' }}
            data-testid="security-scan-log-download"
        >
            <DownloadSimple size={16} />
            Download
        </Anchor>
    )
}

function ScanLogBody({ scan }: { scan: JobScanResult }) {
    if (!scan.logFile) {
        return (
            <Text size="sm" c="dimmed" data-testid="security-scan-log-pending">
                Scan in progress…
            </Text>
        )
    }
    return (
        <Stack gap="sm">
            <ScanRow
                label="Trivy Filesystem Scan:"
                status={scan.trivy}
                passedLabel="No vulnerabilities found"
                failedLabel="Vulnerabilities found"
                testId="security-scan-trivy"
            />
            <ScanRow
                label="SonarQube Quality Gate:"
                status={scan.sonarqube}
                passedLabel="Passed"
                failedLabel="Needs review"
                testId="security-scan-sonarqube"
            />
        </Stack>
    )
}

function SecurityScanLog({ scan, jobId }: { scan: JobScanResult; jobId: string }) {
    return (
        <Stack gap="lg" data-testid="security-scan-log">
            <Text fw={700} fz={16}>
                Security scan log
            </Text>
            <ScanLogBody scan={scan} />
            <ScanLogDownload jobId={jobId} isVisible={scan.logFile != null} />
        </Stack>
    )
}

type SubmittedCodeSectionProps = {
    orgSlug: string
    study: SelectedStudy
    job: Pick<LatestJobForStudy, 'id' | 'files' | 'createdAt'>
    review: StudyReviewWithMeta | null
    scan: JobScanResult
    codeInitiallyExpanded?: boolean
}

// Data fetching lives in the parent (CodeReview) so this component
// stays a plain sync function. Nested async server components don't render
// under testing-library / happy-dom — the parent's await is what tests rely on.
export function SubmittedCodeSection({
    orgSlug,
    study,
    job,
    review,
    scan,
    codeInitiallyExpanded = true,
}: SubmittedCodeSectionProps) {
    const datasetNames = study.orgDataSources.map((ds) => ds.name)
    const proposalHref = Routes.studyReviewProposal({ orgSlug, studyId: study.id })
    const codeFiles = filterAndOrderCodeFiles(job.files)

    return (
        <Paper p="xxl" data-testid="submitted-code-section">
            <Stack gap="md">
                <SubmittedCodeHeader proposalHref={proposalHref} />
                <Divider />
                <DatasetPills names={datasetNames} />
                <Divider />
                <Stack gap="xxl">
                    <Group align="stretch" grow gap="xl" wrap="nowrap">
                        <Paper withBorder p="lg" radius={0}>
                            <AiSummaryCollapsible
                                studyJobId={job.id}
                                initialReview={review}
                                submittedAt={job.createdAt}
                            />
                        </Paper>
                        <Paper withBorder p="lg" radius={0}>
                            <SecurityScanLog scan={scan} jobId={job.id} />
                        </Paper>
                    </Group>
                    <Divider />
                    <StudyCodeViewer studyJobId={job.id} files={codeFiles} initialExpanded={codeInitiallyExpanded} />
                </Stack>
            </Stack>
        </Paper>
    )
}
