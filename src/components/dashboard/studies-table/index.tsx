'use client'

import { useQuery } from '@/common'
import { TableSkeleton } from '@/components/layout/skeleton/dashboard'
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
import { StudyRow } from './study-row'
import { StudiesTableView } from './studies-table-view'
import {
    ACTIVE_PROPOSAL_STATUSES,
    Audience,
    FINAL_STATUS,
    REVIEWER_ACTION_STATUSES,
    Scope,
    StudiesTableProps,
    StudyRow as StudyRowType,
} from './types'

function getQueryKey(audience: Audience, scope: Scope, orgSlug: string, userId?: string): string[] {
    if (scope === 'org') {
        return audience === 'researcher' ? ['researcher-studies', orgSlug] : ['org-studies', orgSlug]
    }
    // User scope
    return audience === 'researcher' ? ['user-researcher-studies'] : ['user-reviewer-studies', userId || '']
}

function filterStudiesForUser(studies: StudyRowType[], audience: Audience, userId: string): StudyRowType[] {
    if (audience === 'researcher') {
        return studies.filter((study) => study.researcherId === userId)
    }
    // Reviewer: show studies where user is assigned OR has taken reviewer actions
    return studies.filter(
        (study) =>
            study.reviewerId === userId ||
            study.jobStatusChanges.some(
                (change) => change.userId === userId && REVIEWER_ACTION_STATUSES.includes(change.status),
            ),
    )
}

function needsRefresh(studies: StudyRowType[], audience: Audience): boolean {
    // Two independent reasons to keep polling:
    //  - study-level: a researcher is awaiting a DO decision (PENDING-REVIEW typically has no job
    //    yet, so the job-level check below can't catch it). Reviewers are excluded because
    //    PENDING-REVIEW is their own next action — re-fetching won't change until they act.
    //  - job-level: an in-flight (non-final) job, regardless of audience or study status.
    return studies.some(
        (study) =>
            (audience === 'researcher' && ACTIVE_PROPOSAL_STATUSES.includes(study.status)) ||
            study.jobStatusChanges.some((change) => !FINAL_STATUS.includes(change.status)),
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
    headerActions,
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

    // For researcher user scope, we need the lab org - return null if not available
    if (scope === 'user' && audience === 'researcher' && !labOrg) {
        return null
    }

    // Loading state
    if (isLoading) {
        return <TableSkeleton showActionButton={showNewStudyButton} paperWrapper={paperWrapper} />
    }

    // Apply client-side filtering for user scope
    const displayedStudies =
        scope === 'user' && userId
            ? filterStudiesForUser(studies as StudyRowType[], audience, userId)
            : (studies as StudyRowType[])

    const shouldShowRefresher = showRefresher && needsRefresh(displayedStudies, audience)

    return (
        <StudiesTableView
            studies={displayedStudies}
            audience={audience}
            scope={scope}
            title={title}
            description={description}
            newStudyHref={showNewStudyButton ? Routes.studyRequest({ orgSlug: effectiveOrgSlug }) : undefined}
            headerActions={headerActions}
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
            renderRow={(study) => (
                <StudyRow key={study.id} study={study} audience={audience} scope={scope} orgSlug={effectiveOrgSlug} />
            )}
        />
    )
}
