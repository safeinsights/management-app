import type React from 'react'
import { AlertNotFound } from '@/components/errors'
import { toRecord } from '@/lib/permissions'
import { Routes } from '@/lib/routes'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'

type ResearcherPageGuardResult = { ok: true } | { ok: false; render: React.ReactNode }

type GuardedStudy = { orgId: string; orgSlug: string; submittedByOrgId: string }

// Mirror of reviewerPageGuard. `view Study` answers audience, not persona: the Data Partner's members
// hold it for every submitted study. The subject carries only submittedByOrgId so their rule cannot
// match, and an SI admin still passes on `manage all`. redirect() throws, so a reviewer never returns.
export async function researcherPageGuard(study: GuardedStudy, studyId: string): Promise<ResearcherPageGuardResult> {
    const session = await sessionFromClerk()
    if (session?.can('view', toRecord('Study', { submittedByOrgId: study.submittedByOrgId }))) {
        return { ok: true }
    }

    // A reviewer is on the wrong surface, not locked out, so send them to the study they can see.
    if (session?.can('review', toRecord('Study', { orgId: study.orgId }))) {
        redirect(Routes.studyReview({ orgSlug: study.orgSlug, studyId }))
    }

    return { ok: false, render: <AlertNotFound title="Study was not found" message="No such study exists" /> }
}
