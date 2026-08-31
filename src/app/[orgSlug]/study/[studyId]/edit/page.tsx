import { AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { getStudyAction } from '@/server/actions/study.actions'
import { StudyProposal } from '../../request/proposal'

export default async function StudyEditPage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const params = await props.params
    const { studyId } = params

    // getStudyAction rather than a query of our own: it carries the `view Study` ability check, so a
    // study the session cannot see is not served here, and it filters soft-deleted rows.
    const study = await getStudyAction({ studyId })

    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    // Step 1 serves two personas (OTTER-764): a DRAFT is the editable wizard, and a submitted study
    // is the same page as a read-only record, which is what the submitted proposal steps back to.
    // No status is turned away, so every study the researcher may see has a Step 1 to return to, and
    // the "Next step" a submitted one offers always lands on a /submitted page that accepts it.
    //
    // The read-only view needs a title to display, and it always has one: the
    // study_title_required_when_not_draft constraint permits a null title on a DRAFT only.
    //
    // /edit is a revisitable step: an authorized researcher can open it directly, forward or back,
    // regardless of how far the study has progressed. The screen authority (resolveScreen) decides
    // the canonical screen, so this page no longer self-redirects to resume on Step 2.
    return (
        <StudyProposal
            studyId={studyId}
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
