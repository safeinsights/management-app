import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { isFeatureFlagOrg } from '@/lib/org'
import { FeatureFlagRequiredAlert } from '@/components/openstax-feature-flag'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { StudyDetails } from '@/components/study/study-details'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { NotFoundError } from '@/lib/errors'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { StudyResults } from './study-results'
import { StudyReviewButtons } from './study-review-buttons'
import type { SelectedStudy } from '@/server/actions/study.actions'

// TEMP FIX: Prevents error on viewing studies created with the new flow (no code = no job)
async function getLatestJobNoNotFoundError(studyId: string): Promise<LatestJobForStudy | null> {
    try {
        return await latestJobForStudy(studyId)
    } catch (error) {
        if (error instanceof NotFoundError) return null
        throw error
    }
}

type EnclaveReviewViewProps = {
    orgSlug: string
    study: SelectedStudy
}

export async function EnclaveReviewView({ orgSlug, study }: EnclaveReviewViewProps) {
    // New-flow studies (feature-flag orgs only) have no code upload, so no job exists yet.
    // For other orgs a missing job is a genuine error — let latestJobForStudy throw.
    if (isFeatureFlagOrg(orgSlug) && !(await getLatestJobNoNotFoundError(study.id))) {
        return (
            <Stack px="xl" gap="xl">
                <OrgBreadcrumbs crumbs={{ orgSlug, current: 'Study Details' }} />
                <FeatureFlagRequiredAlert
                    isNewFlow
                    message={`Study '${study.title}' was created via spy mode without code upload. Enable spy mode to continue.`}
                />
            </Stack>
        )
    }

    // old legacy flow starting here
    const job = await latestJobForStudy(study.id)

    return (
        <Stack px="xl" gap="xl">
            <OrgBreadcrumbs
                crumbs={{
                    orgSlug: orgSlug,
                    current: 'Study Details',
                }}
            />
            <Title order={2} size="h4" fw={500}>
                Study Details
            </Title>
            <Divider />
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Proposal
                        </Title>
                        <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
                    </Group>
                    <StudyDetails studyId={study.id} />
                </Stack>
            </Paper>
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
        </Stack>
    )
}
