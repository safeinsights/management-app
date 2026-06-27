'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { isActionError } from '@/lib/errors'
import { toRecord } from '@/lib/permissions'
import { Routes } from '@/lib/routes'
import { studyHasJobStatus } from '@/lib/studies'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { Stack, Title } from '@mantine/core'
import { AgreementsPage } from '../agreements-page'

// Researcher agreements step. A dual-role user (reviewer via the enclave, researcher via their own
// lab) reaches this route — not the reviewer one — so they stay in the researcher flow even though
// they also hold the review ability. Access requires view of the submitting org's study.
export default async function ResearcherAgreementsRoute(props: {
    params: Promise<{ orgSlug: string; studyId: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { orgSlug, studyId } = await props.params
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

    // /agreements/researcher is a revisitable step. An authorized researcher can view it directly —
    // forward or back — even after acknowledging, so it does not self-redirect. The screen authority
    // (resolveScreen on /view) decides the canonical screen.
    const returnTo = searchParams.returnTo === 'org' ? 'org' : undefined

    const previousHref = Routes.studySubmitted({ orgSlug: study.submittedByOrgSlug, studyId })

    // OTTER-614: once code is submitted, Proceed lands on the read-only code screen
    // (/view?step=code), NOT the editable upload page — the researcher must not edit code at this
    // stage. Before submission it still targets the upload page for the first-time code upload.
    const codeSubmitted = studyHasJobStatus(study, 'CODE-SUBMITTED')
    const proceedHref = codeSubmitted
        ? Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId, returnTo, step: 'code' })
        : Routes.studyCode({ orgSlug: study.submittedByOrgSlug, studyId })

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ orgSlug, studyId, current: 'Agreements' }} />
            <Title order={1}>Study request</Title>
            <AgreementsPage
                isReviewer={false}
                studyId={studyId}
                proceedHref={proceedHref}
                previousHref={previousHref}
                previousLabel="Previous"
            />
        </Stack>
    )
}
