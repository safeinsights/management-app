import { Anchor, Box, Divider, Group, Paper, Pill, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOut, CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import type { LatestCodeScanForStudy, LatestJobForStudy, StudyReviewWithMeta } from '@/server/db/queries'
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

function ScanStatusIcon({ scan }: { scan: LatestCodeScanForStudy | null }) {
    if (!scan) return null
    const passed = scan.status === 'SCAN-COMPLETE'
    const Icon = passed ? CheckCircle : XCircle
    const colorVar = `var(--mantine-color-${passed ? 'green' : 'red'}-6)`
    const dataIcon = passed ? 'pass' : 'fail'
    return <Icon size={20} weight="fill" color={colorVar} data-icon={dataIcon} aria-hidden="true" />
}

function ScanLogBody({ scan }: { scan: LatestCodeScanForStudy | null }) {
    if (!scan?.results) {
        return (
            <Text size="sm" c="dimmed" data-testid="security-scan-log-empty">
                No scan results available.
            </Text>
        )
    }
    return (
        <Box
            bg="charcoal.0"
            p="md"
            style={{ borderRadius: 'var(--mantine-radius-sm)', fontFamily: 'monospace' }}
            data-testid="security-scan-log-body"
        >
            <Text size="sm" component="pre" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {scan.results}
            </Text>
        </Box>
    )
}

function SecurityScanLog({ scan }: { scan: LatestCodeScanForStudy | null }) {
    return (
        <Stack gap="xs" data-testid="security-scan-log">
            <Group gap="xs" wrap="nowrap">
                <Text fw={700}>Security scan log</Text>
                <ScanStatusIcon scan={scan} />
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
    codeScan: LatestCodeScanForStudy | null
}

// Data fetching lives in the parent (CodeReviewRedesignView) so this component
// stays a plain sync function. Nested async server components don't render
// under testing-library / happy-dom — the parent's await is what tests rely on.
export function SubmittedCodeSection({ orgSlug, study, job, review, codeScan }: SubmittedCodeSectionProps) {
    const datasetNames = (study.orgDataSources ?? []).map((ds) => ds.name)
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
                    <SecurityScanLog scan={codeScan} />
                </Group>
                <Divider />
                <StudyCodeViewer files={codeFiles} />
            </Stack>
        </Paper>
    )
}
