import { Button, Paper, Stack, Text, Title } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { getStudyAction } from '@/server/actions/study.actions'
import { getOrgNameFromId } from '@/server/db/queries'
import { StudyRequestPageHeader } from '../../request/page-header'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'

export default async function StudySubmittedRoute(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const result = await getStudyAction({ studyId })

    if (isActionError(result) || !result) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const orgName = await getOrgNameFromId(result.orgId)

    return (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader orgSlug={orgSlug} />
            <Paper p="xl">
                <Stack align="center" gap="md" py="xl">
                    <CheckCircleIcon size={60} weight="fill" color="var(--mantine-color-green-9)" />
                    <Title order={5} c="green.9">
                        Your study proposal has been submitted successfully.
                    </Title>
                    <Text ta="center" maw={800}>
                        {displayOrgName(orgName)} will follow up with feedback, follow-up questions, or a decision.
                        Please check your dashboard for notifications and status updates.
                    </Text>
                    <Button
                        component={Link}
                        href={Routes.studyView({ orgSlug, studyId })}
                        variant="outline"
                        mt="md"
                        size="md"
                    >
                        View submitted study proposal
                    </Button>
                </Stack>
            </Paper>
            <Stack gap="sm" align="flex-end">
                <Button component={Link} href={Routes.orgDashboard({ orgSlug })} size="md">
                    Go to dashboard
                </Button>
            </Stack>
        </Stack>
    )
}
