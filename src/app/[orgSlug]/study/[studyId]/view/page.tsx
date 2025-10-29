import { AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { checkWorkspaceExistsAction } from '@/server/actions/coder.actions'
import { getStudyAction } from '@/server/actions/study.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { currentUser } from '@clerk/nextjs/server'
import { StudyReviewClient } from './page.client'

export const dynamic = 'force-dynamic'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId } = await props.params

    // getStudyAction will check permissions
    const studyResult = await getStudyAction({ studyId })
    const user = await currentUser()
    if (!studyResult || isActionError(studyResult)) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }
    const study = studyResult
    let workspaceAlreadyExists = false

    const job = await latestJobForStudy(studyId)
    const email = user?.primaryEmailAddress?.emailAddress ?? ''
    const userId = study.researcherId
    let name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`
    if (name.length === 0) {
        name = study.researcherId
    }

    const workspaceData = await checkWorkspaceExistsAction({
        email,
        userId,
        studyId,
    })
    if (!isActionError(workspaceData)) workspaceAlreadyExists = workspaceData.exists

    // Pass data to client component
    return (
        <StudyReviewClient
            study={study}
            job={job}
            email={email}
            name={name}
            workspaceAlreadyExists={workspaceAlreadyExists}
        />
    )
}
