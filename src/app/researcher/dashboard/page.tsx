import * as React from 'react'
import { db } from '@/database'
import {
    Alert,
    Button,
    Flex,
    Group,
    Paper,
    Stack,
    Table,
    TableCaption,
    TableTbody,
    TableTd,
    TableTh,
    TableThead,
    TableTr,
    Text,
    Title,
    Tooltip,
} from '@mantine/core'
import dayjs from 'dayjs'
import Link from 'next/link'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { humanizeStatus } from '@/lib/status'
import { UserName } from '../../../../components/user-name'
import { getUserIdFromActionContext } from '@/server/actions/wrappers'

import { ensureUserIsMemberOfOrg } from '@/server/mutations'
import { ErrorAlert } from '@/components/errors'

export const dynamic = 'force-dynamic'

const NoStudiesCaption: React.FC<{ visible: boolean; slug: string }> = ({ visible, slug }) => {
    if (!visible) return null

    return (
        <TableCaption>
            <Alert variant="transparent">
                You haven&apos;t started a study yet
                <Stack>
                    <Link style={{ textDecoration: 'underline' }} href={`/researcher/study/request/${slug}`}>
                        Propose New Study
                    </Link>
                </Stack>
            </Alert>
        </TableCaption>
    )
}

export default async function ResearcherDashboardPage(): Promise<React.ReactElement> {
    const userId = await getUserIdFromActionContext()
    let org: { identifier: string } | null = null
    // FIXME: it should be possible to remove this once we ensure all users have an org
    try {
        org = await ensureUserIsMemberOfOrg()
    } catch {
        return <ErrorAlert error="Your account is not configured correctly. No organizations found" />
    }

    const studies = await db
        .selectFrom('study')
        .select(['study.id', 'title', 'piName', 'status', 'study.memberId', 'createdAt'])

        // security, check that user is a member of the org that owns the study
        .innerJoin('memberUser', 'memberUser.memberId', 'study.memberId')
        .where('memberUser.userId', '=', userId)

        .orderBy('createdAt', 'desc')
        .execute()

    const rows = studies.map((study) => (
        <TableTr key={study.id}>
            <TableTd>
                <Tooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }}>
                        {study.title}
                    </Text>
                </Tooltip>
            </TableTd>
            <TableTd>
                <Text>{dayjs(study.createdAt).format('MMM DD, YYYY')}</Text>
            </TableTd>
            <TableTd>Review Team Name</TableTd>
            <TableTd>
                <Stack gap="xs">
                    {humanizeStatus(study.status)}
                    <Text
                        fz={10}
                        pl={8}
                        c="dimmed"
                        style={{ width: '65px', backgroundColor: '#D9D9D9', textAlign: 'left', borderRadius: '2px' }}
                        className="text-xs"
                    >
                        TBC
                    </Text>
                </Stack>
            </TableTd>
            <TableTd>
                <Link style={{ textDecoration: 'underline' }} href={`/researcher/study/${study.id}/review`}>
                    View
                </Link>
            </TableTd>
        </TableTr>
    ))

    return (
        <Stack p="md">
            <Title>
                Hi <UserName />!
            </Title>
            <Stack>
                <Text mt="md">Welcome to SafeInsights</Text>

                <Text>
                    We&apos;re so glad to have you. This space is intended to help you submit your proposed studies and
                    associated code, as well as accessing your analysis results—all while ensuring strict data privacy
                    and security. Your work plays a vital role in advancing educational research, and w&apos;re
                    committed to making this process as seamless as possible. We&apos;re continuously refining the
                    experience and value your feedback in shaping a more effective research environment.
                </Text>
            </Stack>

            <Paper shadow="xs" p="xl">
                <Stack>
                    <Group justify="space-between">
                        <Title order={3}>Proposed Studies</Title>
                        <Flex justify="flex-end">
                            <Link href={`/researcher/study/request/${org.identifier}`}>
                                <Button leftSection={<Plus />}>Propose New Study</Button>
                            </Link>
                        </Flex>
                    </Group>
                    <Table layout="fixed" verticalSpacing="md" striped highlightOnHover>
                        <NoStudiesCaption visible={!studies.length} slug={org.identifier} />
                        <TableThead>
                            <TableTr>
                                <TableTh>Study Name</TableTh>
                                <TableTh>Submitted On</TableTh>
                                <TableTh>Submitted To</TableTh>
                                <TableTh>Status</TableTh>
                                <TableTh>Study Details</TableTh>
                            </TableTr>
                        </TableThead>
                        <TableTbody>{rows}</TableTbody>
                    </Table>
                </Stack>
            </Paper>
        </Stack>
    )
}
