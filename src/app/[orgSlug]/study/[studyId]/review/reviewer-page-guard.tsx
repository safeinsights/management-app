import type React from 'react'
import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { toRecord } from '@/lib/permissions'
import { Routes } from '@/lib/routes'
import { isSubmittedStudy, type Submitted } from '@/schema/study'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'

type ReviewerPageGuardResult =
    | { ok: true; study: Submitted<SelectedStudy>; orgSlug: string; studyId: string }
    | { ok: false; render: React.ReactNode }

// Shared by /review and /review/proposal so a non-reviewer hitting either URL is handled
// identically. redirect() throws, so the researcher case never returns.
export async function reviewerPageGuard(orgSlug: string, studyId: string): Promise<ReviewerPageGuardResult> {
    const notFound = <AlertNotFound title="Study was not found" message="No such study exists" />

    const session = await sessionFromClerk()
    if (!session) return { ok: false, render: <AccessDeniedAlert /> }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) return { ok: false, render: notFound }

    // Gated on the review ability, not org membership, so an SI admin can review any org's study.
    const canReview = session.can('review', toRecord('Study', { orgId: study.orgId }))
    if (!canReview) {
        if (session.can('view', toRecord('Study', { submittedByOrgId: study.submittedByOrgId }))) {
            redirect(Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId }))
        }
        return { ok: false, render: <AccessDeniedAlert /> }
    }

    if (!isSubmittedStudy(study)) return { ok: false, render: notFound }

    return { ok: true, study, orgSlug, studyId }
}
