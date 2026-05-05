'use client'

import type { FC } from 'react'
import { Alert, Button, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { displayOrgName } from '@/lib/string'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { StudyStatus } from '@/database/types'
import { ProposalHeader } from '../../request/page-header'
import { Routes } from '@/lib/routes'
import { Link } from '@/components/links'

interface ProposalSubmittedProps {
    orgSlug: string
    study: SelectedStudy
    orgName: string
}

type ProposalBannerConfig = {
    color: string
    message: (orgName: string) => string
    statusBadge?: string
}

const PROPOSAL_BANNERS: Partial<Record<StudyStatus, ProposalBannerConfig>> = {
    'PENDING-REVIEW': {
        color: 'yellow',
        message: (orgName) =>
            `Your initial request has been successfully submitted to ${displayOrgName(orgName)}. They will review it and respond with feedback or a decision. You'll receive email notifications as your request progresses through the review process. Please allow an estimated 7 to 10 days for a complete review.`,
    },
    APPROVED: {
        color: 'green',
        statusBadge: 'Approved on',
        message: (orgName) =>
            `${displayOrgName(orgName)} has reviewed and approved your initial request. Review their feedback below, then proceed to Step 3 - Agreements to sign the required legal documents.`,
    },
    REJECTED: {
        color: 'red',
        statusBadge: 'Rejected on',
        message: (orgName) =>
            `${displayOrgName(orgName)} has reviewed your initial request and is unable to support it at this time. Please review their feedback below for more details.`,
    },
    'CHANGE-REQUESTED': {
        color: 'blue',
        statusBadge: 'Clarification requested on',
        message: (orgName) =>
            `${displayOrgName(orgName)} has reviewed your initial request and has requested clarifications. Please review their feedback below. You can revise and resubmit your request to address their questions.`,
    },
}

function StatusBanner({ orgName, status }: { orgName: string; status: StudyStatus }) {
    const config = PROPOSAL_BANNERS[status]
    if (!config) return null

    return (
        <Alert color={config.color} mb="md">
            {config.message(orgName)}
        </Alert>
    )
}

const ProposalNavigation: FC<{ orgSlug: string; study: SelectedStudy }> = ({ orgSlug, study }) => {
    const studyParams = { orgSlug, studyId: study.id }

    switch (study.status) {
        case 'CHANGE-REQUESTED':
            return (
                <Group justify="space-between">
                    <Button
                        component={Link}
                        href={Routes.dashboard}
                        variant="subtle"
                        size="md"
                        leftSection={<CaretLeftIcon />}
                    >
                        Back
                    </Button>
                    {/* TODO: Add a link to the study resubmit page */}
                    <Button component={Link} href={Routes.studyEdit(studyParams)} size="md">
                        Edit and resubmit
                    </Button>
                </Group>
            )
        case 'APPROVED':
            return (
                <Group justify="space-between">
                    <Button
                        component={Link}
                        href={Routes.dashboard}
                        variant="subtle"
                        size="md"
                        leftSection={<CaretLeftIcon />}
                    >
                        Back
                    </Button>
                    <Button component={Link} href={Routes.studyAgreements(studyParams)} size="md">
                        Proceed to step 3
                    </Button>
                </Group>
            )
        default:
            return (
                <Group justify="flex-end">
                    <Button component={Link} href={Routes.dashboard} size="md">
                        Go to dashboard
                    </Button>
                </Group>
            )
    }
}

export function ProposalSubmitted({ orgSlug, study, orgName }: ProposalSubmittedProps) {
    const bannerConfig = PROPOSAL_BANNERS[study.status]

    return (
        <Stack p="xl" gap="xl">
            <ProposalHeader orgSlug={orgSlug} title="Study proposal" studyId={study.id} studyTitle={study.title} />
            <Stack gap="xxl">
                <ProposalRequest
                    study={study}
                    orgSlug={orgSlug}
                    stepLabel="STEP 2"
                    heading="Initial request"
                    banner={<StatusBanner orgName={orgName} status={study.status} />}
                    statusBadge={bannerConfig?.statusBadge}
                    initialExpanded={false}
                />
                <ProposalNavigation orgSlug={orgSlug} study={study} />
            </Stack>
        </Stack>
    )
}
