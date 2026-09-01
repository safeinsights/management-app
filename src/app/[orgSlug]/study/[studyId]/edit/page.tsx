import { AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { getStudyAction } from '@/server/actions/study.actions'
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

    // getStudyAction rather than a query of our own: it carries the `view Study` ability check, so a
    // study the session cannot see is not served here, and it filters soft-deleted rows.
    const study = await getStudyAction({ studyId })

    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    // Step 1 serves two personas (OTTER-764): a DRAFT is the editable wizard, and a submitted study
    // is the same page as a read-only record, which is what the submitted proposal steps back to.
    //
    // /edit is a revisitable step, so it never self-redirects to resume on Step 2; resolveScreen
    // decides the canonical screen.
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
                descriptionDocPath: study.descriptionDocPath,
                irbDocPath: study.irbDocPath,
                agreementDocPath: study.agreementDocPath,
            }}
        />
    )
}
