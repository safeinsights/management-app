'use client'

import { Alert, Button, Stack } from '@mantine/core'
import { displayOrgName } from '@/lib/string'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { ProposalHeader } from '../../request/page-header'
import { Routes } from '@/lib/routes'
import { Link } from '@/components/links'

interface ProposalSubmittedProps {
    orgSlug: string
    study: SelectedStudy
    orgName: string
}

function SubmissionAlert({ orgName }: { orgName: string }) {
    return (
        <Alert color="yellow" mb="md">
            Your initial request has been successfully submitted to {displayOrgName(orgName)}. They will review it and
            respond with feedback or a decision. You&apos;ll receive email notifications as your request progresses
            through the review process. Please allow an estimated 7 to 10 days for a complete review.
        </Alert>
    )
}

export function ProposalSubmitted({ orgSlug, study, orgName }: ProposalSubmittedProps) {
    return (
        <Stack p="xl" gap="xl">
            <ProposalHeader orgSlug={orgSlug} title="Study proposal" studyId={study.id} studyTitle={study.title} />
            <Stack gap="xxl">
                <ProposalRequest
                    study={study}
                    orgSlug={orgSlug}
                    stepLabel="STEP 2"
                    heading="Initial request"
                    banner={<SubmissionAlert orgName={orgName} />}
                    initialExpanded={false}
                />
                <Stack gap="sm" align="flex-end">
                    <Button component={Link} href={Routes.dashboard} size="md">
                        Go to dashboard
                    </Button>
                </Stack>
            </Stack>
        </Stack>
    )
}
