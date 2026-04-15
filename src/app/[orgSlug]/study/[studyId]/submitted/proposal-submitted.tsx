'use client'

import { Alert, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import dayjs from 'dayjs'
import { displayOrgName } from '@/lib/string'
import { ProposalHeader } from '../../request/page-header'
import { Routes } from '@/lib/routes'
import { Link } from '@/components/links'

interface ProposalSubmittedProps {
    orgSlug: string
    studyId: string
    studyTitle: string
    submittedAt: Date | string | null
    orgName: string
}

export function ProposalSubmitted({ orgSlug, studyId, studyTitle, submittedAt, orgName }: ProposalSubmittedProps) {
    return (
        <Stack p="xl" gap="xl">
            <ProposalHeader orgSlug={orgSlug} title="Study proposal" studyId={studyId} studyTitle={studyTitle} />
            <Stack gap="xxl">
                <Paper p="xxl">
                    <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                        STEP 2
                    </Text>
                    <Title fz={20} order={4} c="charcoal.9" pb={4}>
                        Initial request
                    </Title>
                    <Group justify="space-between" align="center">
                        <Text c="charcoal.9">Title: {studyTitle}</Text>
                        {submittedAt && (
                            <Text fz={12} c="charcoal.7">
                                Submitted on {dayjs(submittedAt).format('MMM DD, YYYY')}
                            </Text>
                        )}
                    </Group>
                    <Divider my="md" />
                    <Alert color="yellow" mt="md">
                        Your initial request has been successfully submitted to {displayOrgName(orgName)}. They will
                        review it and respond with feedback or a decision. You&apos;ll receive email notifications as
                        your request progresses through the review process. Please allow an estimated 7 to 10 days for a
                        complete review.
                    </Alert>
                </Paper>
                <Stack gap="sm" align="flex-end">
                    <Button component={Link} href={Routes.dashboard} size="md">
                        Go to dashboard
                    </Button>
                </Stack>
            </Stack>
        </Stack>
    )
}
