import { AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { toRecord } from '@/lib/permissions'
import { Routes } from '@/lib/routes'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { StudyProposal } from '../../request/proposal'

export default async function StudyEditPage(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const params = await props.params
    const { studyId } = params
    const searchParams = await props.searchParams
    // Read exactly as /submitted reads it, so a step back and forward preserves the org-scoped entry.
    const returnTo = searchParams.returnTo === 'org' ? 'org' : undefined

    // getStudyAction rather than a query of our own: it carries the `view Study` ability check and
    // filters soft-deleted rows.
    const study = await getStudyAction({ studyId })

    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const session = await sessionFromClerk()
    // `view Study` answers audience, not persona: the Data Partner's members hold it for every
    // submitted study. Step 1 is the Research Lab's page, so scope to the submitting lab the way
    // agreements/researcher does. OTTER-768 shares this with the routes that still lack it.
    const isResearchLabMember = !!session?.can('view', toRecord('Study', { submittedByOrgId: study.submittedByOrgId }))

    if (!isResearchLabMember) {
        // A reviewer here is on the wrong surface, not locked out: send them to the study they can
        // legitimately see, so the submitted page's "Previous step" link is never a dead end.
        if (session?.can('review', toRecord('Study', { orgId: study.orgId }))) {
            redirect(Routes.studyReview({ orgSlug: study.orgSlug, studyId }))
        }
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    // A DRAFT is the editable wizard, a submitted study the same page as a read-only record
    // (OTTER-764). Revisitable either way, so it never self-redirects to resume on Step 2.
    return (
        <StudyProposal
            studyId={studyId}
            returnTo={returnTo}
            draftData={{
                id: studyId,
                title: study.title ?? '',
                piName: study.piName,
                language: study.language,
                status: study.status,
                orgSlug: study.orgSlug,
                orgName: study.orgName,
                // Never the slug: displayLabName owns that fallback, and a slug sent through
                // displayOrgName loses its trailing word (OTTER-619).
                submittingLabName: study.submittingLabName,
                descriptionDocPath: study.descriptionDocPath,
                irbDocPath: study.irbDocPath,
                agreementDocPath: study.agreementDocPath,
            }}
        />
    )
}
