'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { toRecord } from '@/lib/permissions'
import { Routes } from '@/lib/routes'
import { studyHasJobStatus } from '@/lib/studies'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'

// OTTER-727: the Agreements step is hidden. Nothing links here any more, so this route exists only to
// catch stale bookmarks, browser history and old emails — it redirects to the code step instead of
// rendering the placeholder. The study is still loaded because the destination depends on code stage,
// and access is still checked so the redirect can't be used to probe studies the user can't see.
export default async function ResearcherAgreementsRoute(props: {
    params: Promise<{ orgSlug: string; studyId: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { studyId } = await props.params
    const searchParams = await props.searchParams

    const session = await sessionFromClerk()
    if (!session) {
        return <AccessDeniedAlert />
    }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    if (!session.can('view', toRecord('Study', { submittedByOrgId: study.submittedByOrgId }))) {
        return <AccessDeniedAlert />
    }

    const returnTo = searchParams.returnTo === 'org' ? 'org' : undefined

    // Inherits what the Agreements page's own Proceed computed: once code is submitted, land on the
    // read-only code step — NOT plain /view, which would jump an advanced study straight to results.
    const codeSubmitted = studyHasJobStatus(study, 'CODE-SUBMITTED')
    redirect(
        codeSubmitted
            ? Routes.studyViewCode({ orgSlug: study.submittedByOrgSlug, studyId, returnTo })
            : Routes.studyCode({ orgSlug: study.submittedByOrgSlug, studyId }),
    )
}
