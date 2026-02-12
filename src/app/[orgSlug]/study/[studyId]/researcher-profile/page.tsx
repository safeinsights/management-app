'use server'

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
}) {
    const { orgSlug, studyId } = await props.params

    const session = await sessionFromClerk()
    if (!session) {
        return <AccessDeniedAlert />
    }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const profileData = await getResearcherProfileByUserIdAction({
        userId: study.researcherId,
        studyId: study.id,
    })

    if (isActionError(profileData) || !profileData || !profileData.profile) {
        return <AlertNotFound title="Researcher profile not found" message="No profile data available" />
    }

    return <ResearcherProfileView orgSlug={orgSlug} studyId={studyId} profileData={profileData} />
}
