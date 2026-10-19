import type { Story } from '@ladle/react'
import type { ReactNode } from 'react'
import { Box, Button, Divider, Group, Paper, Radio, Stack, Text, Textarea, Title } from '@mantine/core'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { ProposalReviewLayoutView } from './proposal-review-layout-view'

// The View components own page chrome only, so session-free fixtures stand in for the
// data-driven sections.
const meta = { title: 'Pages / Review study', argTypes: pageBackgroundArgTypes }
export default meta

// One title for the page: the header and the proposal body describe the same study.
const PROPOSAL_STUDY_TITLE = 'Reading comprehension cohort analysis'

function LabelValue({ label, value }: { label: string; value: ReactNode }) {
    return (
        <Stack gap={4}>
            <Text fw={600} size="sm">
                {label}
            </Text>
            <Text size="md" component="div">
                {value}
            </Text>
        </Stack>
    )
}

function DatasetPills({ names }: { names: string[] }) {
    return (
        <Group gap="md">
            {names.map((name) => (
                <Box key={name} bg="grey.0" px="sm" py={4} style={{ borderRadius: 'var(--mantine-radius-sm)' }}>
                    <Text size="sm" c="charcoal.9">
                        {name}
                    </Text>
                </Box>
            ))}
        </Group>
    )
}

function ProposalBodyFixture() {
    return (
        <Paper p="xxl" data-testid="proposal-section">
            <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                STEP 1
            </Text>
            <Title order={4} fz={20} c="charcoal.9" pb="md">
                Review study proposal
            </Title>
            <Divider mb="md" />
            <Stack gap="md">
                <LabelValue label="Study title" value={PROPOSAL_STUDY_TITLE} />
                <Divider />
                <LabelValue
                    label="Dataset(s) of interest"
                    value={<DatasetPills names={['Reading scores 2024', 'Cohort demographics']} />}
                />
                <Divider />
                <LabelValue
                    label="Research question(s)"
                    value="Does adaptive reading practice improve comprehension scores across cohorts?"
                />
                <Divider />
                <LabelValue
                    label="Project summary"
                    value="A longitudinal analysis of reading comprehension outcomes using anonymized cohort data."
                />
                <Divider />
                <LabelValue
                    label="Impact"
                    value="Findings could inform adaptive curriculum design for early readers."
                />
                <Divider />
                <LabelValue label="Principal Investigator" value="Dr. Ada Lovelace" />
                <Divider />
                <LabelValue label="Researcher" value="Grace Hopper" />
            </Stack>
        </Paper>
    )
}

const DECISION_OPTIONS = [
    { value: 'approve', label: 'Approve', description: 'Approve the proposal to begin the code submission phase.' },
    {
        value: 'needs-clarification',
        label: 'Request revision',
        description: 'Send the proposal back to OPE-Research Lab for changes or additional information.',
    },
    {
        value: 'reject',
        label: 'Decline and end study',
        description:
            'Permanently close this study. Use only for major issues that cannot be resolved. This action cannot be undone.',
    },
]

function DecisionFixture() {
    const radios = DECISION_OPTIONS.map((option) => (
        <Radio
            key={option.value}
            value={option.value}
            label={option.label}
            description={option.description}
            styles={{ label: { fontWeight: 600, fontSize: 16 }, description: { fontSize: 14 } }}
        />
    ))
    return (
        <Box data-testid="review-decision-section">
            <Radio.Group name="review-decision-fixture" defaultValue="approve" label="Decision">
                <Stack gap="md">{radios}</Stack>
            </Radio.Group>
        </Box>
    )
}

function ProposalActionsFixture() {
    return (
        <Group justify="space-between">
            <Button variant="outline" color="red">
                Reject request
            </Button>
            <Button>Approve request</Button>
        </Group>
    )
}

export const ReviewProposal: Story = () => (
    <ProposalReviewLayoutView
        header={
            <StudyPageHeader
                study={{
                    title: PROPOSAL_STUDY_TITLE,
                    submittingLabName: 'Genius Lab',
                    isTestStudy: false,
                }}
            />
        }
        proposal={<ProposalBodyFixture />}
        feedbackAndNotes={null}
        feedback={
            <Box>
                <Text fw={600} mb="sm">
                    Reviewer feedback
                </Text>
                <Textarea placeholder="Share feedback with the researcher." autosize minRows={4} />
            </Box>
        }
        decision={<DecisionFixture />}
        actions={<ProposalActionsFixture />}
    />
)
