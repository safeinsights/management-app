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

// Shared access preamble for the reviewer entry points (/review and /review/proposal). Both pages
// must apply the SAME guards so a non-reviewer hitting either URL directly is handled identically.
// `redirect()` throws, so the researcher case never returns; the not-found/access-denied cases hand
// the JSX back to the page to render.
export async function reviewerPageGuard(orgSlug: string, studyId: string): Promise<ReviewerPageGuardResult> {
    const notFound = <AlertNotFound title="Study was not found" message="No such study exists" />

    const session = await sessionFromClerk()
    if (!session) return { ok: false, render: <AccessDeniedAlert /> }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) return { ok: false, render: notFound }

    // Gate on the review ability, not org membership: an SI admin can review studies for orgs they
    // don't belong to. A researcher who lands here (no review ability, but can view their own study)
    // is bounced to the researcher /view of the submitting org; anyone else is denied.
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
