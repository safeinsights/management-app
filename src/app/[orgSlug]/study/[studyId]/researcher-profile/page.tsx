import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { getStudyAction } from '@/server/actions/study.actions'
import { getResearcherProfileByUserIdAction } from '@/server/actions/researcher-profile.actions'
import { sessionFromClerk } from '@/server/clerk'
import { ResearcherProfileView } from './researcher-profile-view'

export default async function ResearcherProfilePage(props: {
    params: Promise<{
        orgSlug: string
        studyId: string
    }>
    searchParams: Promise<{ userId?: string }>
}) {
    const { orgSlug, studyId } = await props.params
    const searchParams = await props.searchParams
    const userIdParam = searchParams?.userId

    const session = await sessionFromClerk()
    if (!session) {
        return <AccessDeniedAlert />
    }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    // Access is the study's view ability (which getStudyAction already enforced), not org
    // membership — an SI admin can open this without belonging to either org. The URL slug tells
    // us which side we're on: the submitting org's slug means the researcher (lab) context, the
    // reviewing org's slug means the reviewer (enclave) context. This drives the Previous href.
    const orgType = orgSlug === study.submittedByOrgSlug ? 'lab' : 'enclave'

    const profileData = await getResearcherProfileByUserIdAction({
        userId: userIdParam || study.researcherId,
        studyId: study.id,
    })

    if (isActionError(profileData) || !profileData || !profileData.profile) {
        return <AlertNotFound title="Researcher profile not found" message="No profile data available" />
    }

    return <ResearcherProfileView orgSlug={orgSlug} studyId={studyId} profileData={profileData} orgType={orgType} />
}
