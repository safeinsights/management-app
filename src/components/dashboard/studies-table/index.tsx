'use client'

import { useMemo } from 'react'
import { useQuery } from '@/common'
import { TableSkeleton } from '@/components/layout/skeleton/dashboard'
import { Refresher } from '@/components/refresher'
import { useSession } from '@/hooks/session'
import { errorToString } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { getLabOrg, type UserSession } from '@/lib/types'
import { enclaveOrgIds, labOrgIds } from '@/lib/utils'
import {
    fetchStudiesForCurrentResearcherUserAction,
    fetchStudiesForCurrentReviewerAction,
    fetchStudiesForOrgAction,
} from '@/server/actions/study.actions'
import { getColumns } from './columns'
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

function getQueryKey(audience: Audience, scope: Scope, orgSlug: string, userId?: string): string[] {
    if (scope === 'org') {
        return audience === 'researcher' ? [RESEARCHER_STUDIES_QUERY_KEYS.org, orgSlug] : ['org-studies', orgSlug]
    }
    return audience === 'researcher' ? [RESEARCHER_STUDIES_QUERY_KEYS.user] : ['user-reviewer-studies', userId || '']
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
        // The intro needs at least one study past draft (OTTER-617 D7).
        showDescription: studies.some((study) => study.status !== 'DRAFT'),
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
    } = useQuery({
        queryKey,
        queryFn: fetchStudies,
        enabled: scope === 'org' || (scope === 'user' && !!userId),
        refetchOnWindowFocus: false,
    })
    const studies = data as StudyRowType[]

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
        />
    )
}
