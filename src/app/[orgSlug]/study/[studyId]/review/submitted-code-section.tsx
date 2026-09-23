import { Button, Divider, Group, Paper, Pill, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import type { Ref } from 'react'
import { Routes } from '@/lib/routes'
import type { JobAnalysis, LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'
import {
    FULL_STUDY_CODE_TOGGLE_LABELS,
    StudyCodeToggle,
} from '@/app/[orgSlug]/study/[studyId]/view/study-code-collapse'
import { JobAnalysisPanels, StudyCodeViewer } from './submitted-code-interactive'
import { filterAndOrderCodeFiles } from './study-code-files'
import { latestCodeSubmittedAt } from '@/lib/study-job-status'
import { fontWeight } from '@/theme/tokens'

function SubmittedCodeHeader({ proposalHref }: { proposalHref: string }) {
    return (
        <Group justify="space-between" align="center" wrap="nowrap" data-testid="submitted-code-header">
            <Title order={3} fz={18} fw={fontWeight.bold}>
                Submission details
            </Title>
            <Button
                component="a"
                href={proposalHref}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                size="sm"
                rightSection={<ArrowSquareOutIcon weight="bold" size={14} />}
                data-testid="view-approved-initial-request"
            >
                View approved proposal
            </Button>
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
            <Text size="sm" fw={fontWeight.bold}>
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
    // When the parent owns expand/collapse, datasets stay mounted and this hides the AI summary
    // and code files.
    detailsExpanded?: boolean
    // When set, the parent owns expand/collapse. The code viewer then always shows its files and
    // its toggle becomes the section's "Hide full submission details" closer.
    onCollapse?: () => void
    onExpand?: () => void
    expandToggleRef?: Ref<HTMLButtonElement>
}

function SubmissionDetailsExpandToggle({
    isVisible,
    onClick,
    toggleRef,
}: {
    isVisible: boolean
    onClick?: () => void
    toggleRef?: Ref<HTMLButtonElement>
}) {
    if (!isVisible || !onClick) return null
    return (
        <StudyCodeToggle
            ref={toggleRef}
            isVisible
            expanded={false}
            onClick={onClick}
            labels={FULL_STUDY_CODE_TOGGLE_LABELS}
        />
    )
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
    detailsExpanded = true,
    onCollapse,
    onExpand,
    expandToggleRef,
}: SubmittedCodeSectionProps) {
    const datasetNames = study.orgDataSources.map((ds) => ds.name)
    const proposalHref = Routes.studyReviewProposal({ orgSlug, studyId: study.id })
    const codeFiles = filterAndOrderCodeFiles(job.files)
    const submittedAt = latestCodeSubmittedAt(job)
    const showExpandToggle = Boolean(onExpand) && !detailsExpanded
    const expandToggle = (
        <SubmissionDetailsExpandToggle isVisible={showExpandToggle} onClick={onExpand} toggleRef={expandToggleRef} />
    )

    return (
        <Paper p="xxl" data-testid="submitted-code-section">
            <Stack gap="md">
                <SubmittedCodeHeader proposalHref={proposalHref} />
                <Divider />
                <DatasetPills names={datasetNames} />
                <Divider />
                <JobAnalysisPanels
                    studyJobId={job.id}
                    initialAnalysis={analysis}
                    submittedAt={submittedAt}
                    detailsExpanded={detailsExpanded}
                    expandToggle={expandToggle}
                >
                    <Stack gap="xxl">
                        <Divider />
                        <StudyCodeViewer
                            studyJobId={job.id}
                            files={codeFiles}
                            initialExpanded={codeInitiallyExpanded}
                            onCollapse={onCollapse}
                        />
                    </Stack>
                </JobAnalysisPanels>
            </Stack>
        </Paper>
    )
}
