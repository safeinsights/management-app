import type React from 'react'
import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { type ActionResponse, isActionError } from '@/lib/errors'
import { toRecord } from '@/lib/permissions'
import { Routes } from '@/lib/routes'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'

type GuardedStudy = { orgId: string; orgSlug: string; submittedByOrgId: string }

type ResearcherPageGuardResult<T extends GuardedStudy> =
    | { ok: true; study: T }
    | { ok: false; render: React.ReactElement }

// Mirror of reviewerPageGuard. `view Study` answers audience, not persona: the Data Partner's members
// hold it for every submitted study. The subject carries only submittedByOrgId so their rule cannot
// match, and an SI admin still passes on `manage all`. redirect() throws, so a reviewer never returns.
export async function researcherPageGuard<T extends GuardedStudy>(
    study: ActionResponse<T>,
    studyId: string,
): Promise<ResearcherPageGuardResult<T>> {
    const notFound = <AlertNotFound title="Study was not found" message="No such study exists" />

    const session = await sessionFromClerk()
    if (!session) return { ok: false, render: <AccessDeniedAlert /> }

    // The action refuses a study the caller cannot see, so its error is the not-found case (OTTER-878).
    if (isActionError(study)) return { ok: false, render: notFound }

    if (session.can('view', toRecord('Study', { submittedByOrgId: study.submittedByOrgId }))) {
        return { ok: true, study }
    }

    // A reviewer is on the wrong surface, not locked out, so send them to the study they can see.
    if (session.can('review', toRecord('Study', { orgId: study.orgId }))) {
        redirect(Routes.studyReview({ orgSlug: study.orgSlug, studyId }))
    }

    return { ok: false, render: notFound }
}
