'use client'

import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@/common'
import { TableSkeleton } from '@/components/layout/skeleton/dashboard'
import { Refresher } from '@/components/refresher'
import { useSession } from '@/hooks/session'
import { errorToString } from '@/lib/errors'
import { NAV_UNREAD_QUERY_KEY } from '@/lib/nav/side-nav'
import { Routes } from '@/lib/routes'
import { getLabOrg, type UserSession } from '@/lib/types'
import { enclaveOrgIds, labOrgIds } from '@/lib/utils'
import {
    fetchStudiesForCurrentResearcherUserAction,
    fetchStudiesForCurrentReviewerAction,
    fetchStudiesForOrgAction,
} from '@/server/actions/study.actions'
import { getColumns } from './columns'
import { DeleteDraftButton } from './delete-draft-button'
import { buildRowModel } from './row-model'
import { useStudiesTableSort } from './sort'
import { StudiesTableView } from './studies-table-view'
import {
    ACTIVE_PROPOSAL_STATUSES,
    Audience,
    FINAL_STATUS,
    Scope,
    StudiesTableProps,
    StudyRow as StudyRowType,
} from './types'

// Key prefixes of the two researcher tables, for writes that change what a researcher row shows.
export const RESEARCHER_STUDIES_QUERY_KEYS = { user: 'user-researcher-studies', org: 'researcher-studies' } as const

const REVIEWER_STUDIES_QUERY_KEYS = { user: 'user-reviewer-studies', org: 'org-studies' } as const

// Every studies table, for writes that change what any row shows.
export const STUDIES_TABLE_QUERY_KEYS = [
    ...Object.values(RESEARCHER_STUDIES_QUERY_KEYS),
    ...Object.values(REVIEWER_STUDIES_QUERY_KEYS),
]

function getQueryKey(audience: Audience, scope: Scope, orgSlug: string, userId?: string): string[] {
    const keys = audience === 'researcher' ? RESEARCHER_STUDIES_QUERY_KEYS : REVIEWER_STUDIES_QUERY_KEYS
    if (scope === 'org') return [keys.org, orgSlug]
    return audience === 'researcher' ? [keys.user] : [keys.user, userId || '']
}

function needsRefresh(studies: StudyRowType[], audience: Audience): boolean {
    // PENDING-REVIEW usually has no job yet, so the job check alone misses a researcher awaiting
    // a decision; reviewers are excluded because it is their own next action.
    return studies.some(
        (study) =>
            (audience === 'researcher' && ACTIVE_PROPOSAL_STATUSES.includes(study.status)) ||
            study.jobStatusChanges.some((change) => !FINAL_STATUS.includes(change.status)),
    )
}

// The side nav dots read the same rows, so each fresh table answer refreshes them too (OTTER-838).
function useRefreshNavUnread(dataUpdatedAt: number) {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (dataUpdatedAt) void queryClient.invalidateQueries({ queryKey: NAV_UNREAD_QUERY_KEY })
    }, [dataUpdatedAt, queryClient])
}

// Belongs to is a My studies column, and only for someone in two or more orgs of the tab's kind.
const showBelongsTo = (session: UserSession | null | undefined, audience: Audience, scope: Scope) =>
    scope === 'user' && !!session && (audience === 'researcher' ? labOrgIds : enclaveOrgIds)(session).length >= 2

function useStudiesTableRows({
    studies,
    audience,
    scope,
    orgSlug,
    session,
}: {
    studies: StudyRowType[]
    audience: Audience
    scope: Scope
    orgSlug: string
    session: UserSession | null | undefined
}) {
    const userId = session?.user.id
    const rows = useMemo(
        () => studies.map((study) => buildRowModel(study, audience, { orgSlug, userId })),
        [studies, audience, orgSlug, userId],
    )
    const sorted = useStudiesTableSort(rows)
    return {
        ...sorted,
        columns: getColumns(audience, scope, showBelongsTo(session, audience, scope)),
        // OTTER-617 always shows the Data Partner dashboard intro; every other table waits for a
        // submitted study.
        showDescription:
            (audience === 'reviewer' && scope === 'org') || studies.some((study) => study.status !== 'DRAFT'),
    }
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

    const labOrg = session ? getLabOrg(session) : null
    const effectiveOrgSlug = scope === 'user' && audience === 'researcher' ? labOrg?.slug || orgSlug : orgSlug

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
        data = [],
        refetch,
        isError,
        error,
        isFetching,
        isRefetching,
        isLoading,
        dataUpdatedAt,
    } = useQuery({
        queryKey,
        queryFn: fetchStudies,
        enabled: scope === 'org' || (scope === 'user' && !!userId),
        // Saves and decisions made on a study page change Last updated and row membership, and no
        // single mutation can invalidate collaborative saves, so coming back always refetches.
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
    })
    const studies = data as StudyRowType[]
    useRefreshNavUnread(dataUpdatedAt)

    const table = useStudiesTableRows({ studies, audience, scope, orgSlug: effectiveOrgSlug, session })

    if (scope === 'user' && audience === 'researcher' && !labOrg) {
        return null
    }

    if (isLoading) {
        return <TableSkeleton showActionButton={showNewStudyButton} paperWrapper={paperWrapper} />
    }

    const shouldShowRefresher = showRefresher && needsRefresh(studies, audience)

    return (
        <StudiesTableView
            {...table}
            audience={audience}
            title={title}
            description={description}
            newStudyHref={showNewStudyButton ? Routes.studyRequest({ orgSlug: effectiveOrgSlug }) : undefined}
            refresher={
                showRefresher ? (
                    <Refresher
                        isEnabled={shouldShowRefresher}
                        refresh={refetch}
                        isPending={isRefetching || isFetching}
                    />
                ) : undefined
            }
            isError={isError}
            errorMessage={errorToString(error)}
            paperWrapper={paperWrapper}
            DeleteDraft={DeleteDraftButton}
        />
    )
}
