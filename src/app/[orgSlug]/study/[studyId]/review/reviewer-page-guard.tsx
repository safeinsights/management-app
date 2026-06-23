import type React from 'react'
import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
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
// `redirect()` throws, so the lab case never returns; the not-found/access-denied cases hand the
// JSX back to the page to render.
export async function reviewerPageGuard(orgSlug: string, studyId: string): Promise<ReviewerPageGuardResult> {
    const notFound = <AlertNotFound title="Study was not found" message="No such study exists" />

    const session = await sessionFromClerk()
    const currentOrg = session?.orgs[orgSlug]
    if (!session || !currentOrg) return { ok: false, render: <AccessDeniedAlert /> }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) return { ok: false, render: notFound }

    // A lab member who lands on a reviewer route belongs on the researcher /view of the submitting org.
    if (currentOrg.type === 'lab') {
        redirect(Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId }))
    }

    if (!isSubmittedStudy(study)) return { ok: false, render: notFound }
    if (currentOrg.type !== 'enclave') return { ok: false, render: notFound }

    return { ok: true, study, orgSlug, studyId }
}
