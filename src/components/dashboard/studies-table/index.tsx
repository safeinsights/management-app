'use client'

import { useQuery } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { TableSkeleton } from '@/components/layout/skeleton/dashboard'
import { ButtonLink } from '@/components/links'
import { Refresher } from '@/components/refresher'
import { useSession } from '@/hooks/session'
import { errorToString } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { getLabOrg } from '@/lib/types'
import {
    fetchStudiesForCurrentResearcherUserAction,
    fetchStudiesForCurrentReviewerAction,
    fetchStudiesForOrgAction,
} from '@/server/actions/study.actions'
import { Divider, Flex, Group, Paper, Stack, Table, TableTbody, Text, Title } from '@mantine/core'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { TableHeader } from './columns'
import { EmptyState } from './empty-state'
import { StudyRow } from './study-row'
import { Audience, FINAL_STATUS, REVIEWER_ACTION_STATUSES, Scope, StudiesTableProps, StudyRow as StudyRowType } from './types'

function getQueryKey(audience: Audience, scope: Scope, orgSlug: string, userId?: string): string[] {
    if (scope === 'org') {
        return audience === 'researcher' ? ['researcher-studies', orgSlug] : ['org-studies', orgSlug]
    }
    // User scope
    return audience === 'researcher' ? ['user-researcher-studies'] : ['user-reviewer-studies', userId || '']
}

function filterStudiesForUser(
    studies: StudyRowType[],
    audience: Audience,
    userId: string
): StudyRowType[] {
    if (audience === 'researcher') {
        return studies.filter((study) => study.researcherId === userId)
    }
    // Reviewer: show studies where user is assigned OR has taken reviewer actions
    return studies.filter(
        (study) =>
            study.reviewerId === userId ||
            study.jobStatusChanges.some(
                (change) => change.userId === userId && REVIEWER_ACTION_STATUSES.includes(change.status)
            )
    )
}

function needsRefresh(studies: StudyRowType[]): boolean {
    return studies.some((study) =>
        study.jobStatusChanges.some((change) => !FINAL_STATUS.includes(change.status))
    )
}

export function StudiesTable({
    audience,
    scope,
    orgSlug,
    title,
    description,
    showNewStudyButton = false,
    showRefresher = false,
    paperWrapper = false,
}: StudiesTableProps) {
    const { session } = useSession()
    const userId = session?.user.id

    // For researcher user tables, we need the lab org slug for the "New Study" button
    const labOrg = session ? getLabOrg(session) : null
    const effectiveOrgSlug = scope === 'user' && audience === 'researcher' ? labOrg?.slug || orgSlug : orgSlug

    // Select the appropriate fetch function and query key
    const queryKey = getQueryKey(audience, scope, orgSlug, userId)

    const fetchStudies = async () => {
        if (scope === 'org') {
            return fetchStudiesForOrgAction({ orgSlug })
        }
        if (audience === 'researcher') {
            return fetchStudiesForCurrentResearcherUserAction()
        }
        return fetchStudiesForCurrentReviewerAction()
    }

    const {
        data: studies = [],
        refetch,
        isError,
        isFetching,
        isRefetching,
    } = useQuery({
        queryKey,
        placeholderData: [],
        queryFn: fetchStudies,
    })

    // For researcher user scope, we need the lab org - return null if not available
    if (scope === 'user' && audience === 'researcher' && !labOrg) {
        return null
    }

    // Loading state
    if (isFetching && studies.length === 0) {
        return <TableSkeleton showActionButton={showNewStudyButton} paperWrapper={paperWrapper} />
    }

    // Error state
    if (isError) {
        return <ErrorAlert error={`Failed to load studies: ${errorToString(studies)}`} />
    }

    // Apply client-side filtering for user scope
    const displayedStudies = scope === 'user' && userId ? filterStudiesForUser(studies as StudyRowType[], audience, userId) : (studies as StudyRowType[])

    // Empty state
    if (!displayedStudies.length) {
        return <EmptyState audience={audience} orgSlug={effectiveOrgSlug} showNewStudyButton={showNewStudyButton} />
    }

    const shouldShowRefresher = showRefresher && needsRefresh(displayedStudies)

    const content = (
        <Stack>
            <Group justify="space-between" align="center">
                {title && <Title order={3}>{title}</Title>}
                <Flex justify="flex-end" align="center" gap="md">
                    {showRefresher && (
                        <Refresher isEnabled={shouldShowRefresher} refresh={refetch} isPending={isRefetching || isFetching} />
                    )}
                    {showNewStudyButton && (
                        <ButtonLink leftSection={<PlusIcon />} data-testid="new-study" href={Routes.studyRequest({ orgSlug: effectiveOrgSlug })}>
                            Propose New Study
                        </ButtonLink>
                    )}
                </Flex>
            </Group>
            <Divider c="charcoal.1" />
            {description && <Text mb="md">{description}</Text>}
            <Table layout="fixed" verticalSpacing="md" highlightOnHover stickyHeader>
                <TableHeader audience={audience} scope={scope} />
                <TableTbody>
                    {displayedStudies.map((study) => (
                        <StudyRow key={study.id} study={study} audience={audience} scope={scope} orgSlug={effectiveOrgSlug} />
                    ))}
                </TableTbody>
            </Table>
        </Stack>
    )

    if (paperWrapper) {
        return (
            <Paper shadow="xs" p="xxl">
                {content}
            </Paper>
        )
    }

    return content
}
