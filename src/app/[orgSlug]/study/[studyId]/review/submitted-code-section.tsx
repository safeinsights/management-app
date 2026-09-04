import { Anchor, Divider, Group, Paper, Pill, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import type { JobAnalysis, LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { JobAnalysisPanels, StudyCodeViewer } from './submitted-code-interactive'
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

type SubmittedCodeSectionProps = {
    orgSlug: string
    study: SelectedStudy
    job: Pick<LatestJobForStudy, 'id' | 'files' | 'createdAt' | 'statusChanges'>
    analysis: JobAnalysis
    codeInitiallyExpanded?: boolean
    /**
     * When set, the parent owns whole-section expand/collapse (post-decision reviewer page). The
     * code viewer then always shows its files and its toggle becomes the section's "Hide full
     * study code" closer, calling this to collapse the entire card.
     */
    onCollapse?: () => void
}

// A complex resubmission reuses its study job, so createdAt can predate the
// generation request by days. The latest CODE-SUBMITTED event is the only
// timestamp that accurately anchors the summary-generation timeout (and the
// "Submitted/Resubmitted on" header label). We scan for the max createdAt rather
// than relying on statusChanges arriving in any particular order, so a caller
// passing an unsorted array still gets the newest submission back.
export function latestCodeSubmittedAt(job: Pick<LatestJobForStudy, 'createdAt' | 'statusChanges'>): Date | string {
    const submissions = job.statusChanges.filter((change) => change.status === 'CODE-SUBMITTED')
    if (submissions.length === 0) return job.createdAt
    return submissions.reduce((latest, change) =>
        new Date(change.createdAt).getTime() > new Date(latest.createdAt).getTime() ? change : latest,
    ).createdAt
}

// Data fetching lives in the parent (CodeReview) so this component
// stays a plain sync function. Nested async server components don't render
// under testing-library / happy-dom — the parent's await is what tests rely on.
export function SubmittedCodeSection({
    orgSlug,
    study,
    job,
    analysis,
    codeInitiallyExpanded = true,
    onCollapse,
}: SubmittedCodeSectionProps) {
    const datasetNames = study.orgDataSources.map((ds) => ds.name)
    const proposalHref = Routes.studyReviewProposal({ orgSlug, studyId: study.id })
    const codeFiles = filterAndOrderCodeFiles(job.files)
    const submittedAt = latestCodeSubmittedAt(job)

    return (
        <Paper p="xxl" data-testid="submitted-code-section">
            <Stack gap="md">
                <SubmittedCodeHeader proposalHref={proposalHref} />
                <Divider />
                <DatasetPills names={datasetNames} />
                <Divider />
                <Stack gap="xxl">
                    <JobAnalysisPanels studyJobId={job.id} initialAnalysis={analysis} submittedAt={submittedAt} />
                    <Divider />
                    <StudyCodeViewer
                        studyJobId={job.id}
                        files={codeFiles}
                        initialExpanded={codeInitiallyExpanded}
                        onCollapse={onCollapse}
                    />
                </Stack>
            </Stack>
        </Paper>
    )
}
