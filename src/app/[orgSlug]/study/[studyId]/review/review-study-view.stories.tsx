import type { Story } from '@ladle/react'
import type { ReactNode } from 'react'
import { Box, Button, Divider, Flex, Group, Paper, Radio, Stack, Table, Text, Textarea, Title } from '@mantine/core'
import { CaretLeftIcon, DownloadSimpleIcon, EyeIcon, TrophyIcon } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { ProposalReviewLayoutView } from './proposal-review-layout-view'
import { StudyDetailsReviewerView } from './study-details-reviewer-view'

// Page-views for the reviewer (enclave / DO) "Review study" screen. Both *View components are
// presentational: they own page chrome (breadcrumbs, titles, layout, action links) while the
// real containers inject the data/session-driven sections. Here those sections are supplied as
// inline, session-free fixtures so the two meaningful states render in isolation (no QueryClient
// or Clerk in Ladle): (1) the proposal review with its label/value pairs + decision + action bar,
// and (2) the results review "Study Details" page with the Approved status and files table.
const meta = { title: 'Pages / Review study', argTypes: pageBackgroundArgTypes }
export default meta

const ORG_SLUG = 'mars-university'
const STUDY_ID = '11111111-1111-4111-8111-111111111111'

// --- Shared fixture helpers ---------------------------------------------------------------

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
                <Box key={name} bg="grey.10" px="sm" py={4} style={{ borderRadius: 'var(--mantine-radius-sm)' }}>
                    <Text size="sm" c="charcoal.9">
                        {name}
                    </Text>
                </Box>
            ))}
        </Group>
    )
}

// --- State 1: Review study proposal -------------------------------------------------------

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
                <LabelValue label="Study title" value="Reading comprehension cohort analysis" />
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
    { value: 'approve', label: 'Approve', description: 'Approve this initial request and share your feedback.' },
    {
        value: 'needs-clarification',
        label: 'Needs clarification',
        description: 'Request clarifications or specific revisions to this initial request.',
    },
    {
        value: 'reject',
        label: 'Reject',
        description: 'Reject this initial request and share your reasoning with the researcher.',
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
        <Paper p="xl" data-testid="review-decision-section">
            <Text size="md" mb="md">
                Select a decision for this initial request. Your feedback and decision will be shared with the
                researcher.
            </Text>
            <Radio.Group name="review-decision-fixture" defaultValue="approve">
                <Stack gap="md" mt="xs">
                    {radios}
                </Stack>
            </Radio.Group>
        </Paper>
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
        orgSlug={ORG_SLUG}
        studyId={STUDY_ID}
        proposal={<ProposalBodyFixture />}
        feedbackAndNotes={null}
        feedback={
            <Paper p="xl">
                <Text fw={600} mb="sm">
                    Reviewer feedback
                </Text>
                <Textarea placeholder="Share feedback with the researcher." autosize minRows={4} />
            </Paper>
        }
        decision={<DecisionFixture />}
        actions={<ProposalActionsFixture />}
    />
)

// --- State 2: Review results (Study Details) ----------------------------------------------

type ResultFile = { type: string; name: string; size: string }

const RESULT_FILES: ResultFile[] = [
    { type: 'Security Scan Log', name: 'security-scan.log', size: '12.4 KB' },
    { type: 'Results', name: 'results.csv', size: '1.2 MB' },
]

function ApprovedBadge() {
    return (
        <Flex
            align="center"
            gap={4}
            bg="green.1"
            c="green.9"
            bdrs={100}
            px={16}
            py={4}
            style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}
        >
            <TrophyIcon size={12} weight="fill" />
            <Text size="xs" fw={500}>
                Approved
            </Text>
        </Flex>
    )
}

function ResultsFilesTable() {
    const rows = RESULT_FILES.map((file) => (
        <Table.Tr key={file.name}>
            <Table.Td>{file.type}</Table.Td>
            <Table.Td>{file.name}</Table.Td>
            <Table.Td>{file.size}</Table.Td>
            <Table.Td>
                <Button variant="light" size="xs" leftSection={<EyeIcon weight="fill" />}>
                    View
                </Button>
            </Table.Td>
            <Table.Td>
                <Button variant="subtle" size="xs" color="gray" leftSection={<DownloadSimpleIcon weight="fill" />}>
                    Download
                </Button>
            </Table.Td>
        </Table.Tr>
    ))
    return (
        <Table>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>File Type</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Size</Table.Th>
                    <Table.Th>View</Table.Th>
                    <Table.Th>Download</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows}</Table.Tbody>
        </Table>
    )
}

function ResultsBodyFixture() {
    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Title order={4} size="xl">
                        Study Status
                    </Title>
                    <ApprovedBadge />
                </Group>
                <Divider c="dimmed" />
                <Text>
                    The code was successfully processed! Review results and security logs to decide if these can be
                    released to the researcher.
                </Text>
                <ResultsFilesTable />
                <Stack>
                    <Textarea
                        label={<Text mb="sm">Enter Reviewer key to view security scan log</Text>}
                        placeholder="Enter your Reviewer key to access encrypted content."
                        resize="vertical"
                    />
                    <Group>
                        <Button>Decrypt Files</Button>
                    </Group>
                </Stack>
            </Stack>
        </Paper>
    )
}

export const ReviewResults: Story = () => (
    <StudyDetailsReviewerView
        orgSlug={ORG_SLUG}
        previousHref={Routes.studyReview({ orgSlug: ORG_SLUG, studyId: STUDY_ID, from: 'code-review' })}
    >
        <ResultsBodyFixture />
    </StudyDetailsReviewerView>
)

export const PreviousLinkChrome: Story = () => (
    <StudyDetailsReviewerView
        orgSlug={ORG_SLUG}
        previousHref={Routes.studyReview({ orgSlug: ORG_SLUG, studyId: STUDY_ID, from: 'code-review' })}
    >
        <Paper bg="white" p="xxl">
            <Stack>
                <Title order={4} size="xl">
                    Study Status
                </Title>
                <Divider c="dimmed" />
                <Group>
                    <Button variant="subtle" leftSection={<CaretLeftIcon />} disabled>
                        Awaiting decryption
                    </Button>
                </Group>
            </Stack>
        </Paper>
    </StudyDetailsReviewerView>
)
