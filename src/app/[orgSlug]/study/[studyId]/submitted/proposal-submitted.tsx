'use client'

import { useState } from 'react'
import { Alert, Anchor, Button, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { displayOrgName, stringifyJson } from '@/lib/string'
import { DatasetsField, LexicalProposalField, PIField, ResearcherField } from '@/components/study/proposal-fields'
import { usePopover } from '@/hooks/use-popover'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { ProposalHeader } from '../../request/page-header'
import { Routes } from '@/lib/routes'
import { Link } from '@/components/links'

interface ProposalSubmittedProps {
    orgSlug: string
    study: SelectedStudy
    orgName: string
}

export function ProposalSubmitted({ orgSlug, study, orgName }: ProposalSubmittedProps) {
    const [expanded, setExpanded] = useState(false)
    const { getPopoverProps } = usePopover()

    return (
        <Stack p="xl" gap="xl">
            <ProposalHeader orgSlug={orgSlug} title="Study proposal" studyId={study.id} studyTitle={study.title} />
            <Stack gap="xxl">
                <Paper p="xxl">
                    <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                        STEP 2
                    </Text>
                    <Title fz={20} order={4} c="charcoal.9" pb={4}>
                        Initial request
                    </Title>
                    <Group justify="space-between" align="center">
                        <Text c="charcoal.9">Title: {study.title}</Text>
                        {study.submittedAt && (
                            <Text fz={12} c="charcoal.7">
                                Submitted on {dayjs(study.submittedAt).format('MMM DD, YYYY')}
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
                    <Anchor
                        component="button"
                        size="sm"
                        fw={700}
                        onClick={() => setExpanded((prev) => !prev)}
                        mt="md"
                        display="inline-flex"
                        style={{ alignItems: 'center', gap: 4 }}
                    >
                        {expanded ? 'Hide full initial request' : 'View full initial request'}
                        <CaretRightIcon
                            size={12}
                            style={{
                                transition: 'transform 200ms',
                                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            }}
                        />
                    </Anchor>
                </Paper>
                <Collapse in={expanded}>
                    <Paper p="xxl">
                        <Stack gap="md">
                            <DatasetsField
                                datasets={study.datasets ?? []}
                                orgDataSources={study.orgDataSources}
                                size="sm"
                            />
                            <Divider />

                            <LexicalProposalField
                                label="Research question(s)"
                                value={stringifyJson(study.researchQuestions)}
                                divider="none"
                                size="md"
                            />
                            <Divider />

                            <LexicalProposalField
                                label="Project summary"
                                value={stringifyJson(study.projectSummary)}
                                divider="none"
                                size="md"
                            />
                            <Divider />

                            <LexicalProposalField
                                label="Impact"
                                value={stringifyJson(study.impact)}
                                divider="none"
                                size="md"
                            />
                            <Divider />

                            <LexicalProposalField
                                label="Additional notes or requests"
                                value={stringifyJson(study.additionalNotes)}
                                divider="none"
                                size="md"
                            />

                            <PIField study={study} orgSlug={orgSlug} {...getPopoverProps('pi')} />
                            <ResearcherField
                                study={study}
                                orgSlug={orgSlug}
                                {...getPopoverProps('researcher')}
                                mt="md"
                            />
                            <Divider />
                            <Anchor
                                component="button"
                                size="sm"
                                fw={700}
                                onClick={() => setExpanded(false)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                                Hide full initial request
                                <CaretRightIcon size={12} style={{ transform: 'rotate(90deg)' }} />
                            </Anchor>
                        </Stack>
                    </Paper>
                </Collapse>
                <Stack gap="sm" align="flex-end">
                    <Button component={Link} href={Routes.dashboard} size="md">
                        Go to dashboard
                    </Button>
                </Stack>
            </Stack>
        </Stack>
    )
}
