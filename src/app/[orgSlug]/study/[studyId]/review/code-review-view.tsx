import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { latestJobForStudy } from '@/server/db/queries'
import { Routes } from '@/lib/routes'
import { Button, Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { SecurityScanPanel } from './security-scan-panel'
import { StudyResults } from './study-results'
import { StudyReviewButtons } from './study-review-buttons'
import type { SelectedStudy } from '@/server/actions/study.actions'

type CodeReviewViewProps = {
    orgSlug: string
    study: SelectedStudy
}

export async function CodeReviewView({ orgSlug, study }: CodeReviewViewProps) {
    const job = await latestJobForStudy(study.id)

    return (
        <Stack px="xl" gap="xl">
            <OrgBreadcrumbs
                crumbs={{
                    orgSlug,
                    current: 'Study Details',
                }}
            />
            <Title order={2} size="h4" fw={500}>
                Study Details
            </Title>
            <Divider />
            <SecurityScanPanel job={job} />
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Code
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    <StudyCodeDetails job={job} />
                </Stack>
            </Paper>
            <StudyResults job={job} />
            <StudyReviewButtons study={study} />
            <Group>
                <Button
                    component={Link}
                    href={Routes.studyAgreements({ orgSlug, studyId: study.id })}
                    variant="subtle"
                    leftSection={<CaretLeftIcon />}
                >
                    Previous
                </Button>
            </Group>
        </Stack>
    )
}
