import { notFound } from 'next/navigation'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { StudyDetailsResearcher } from '../view/study-details-researcher'
import type { ScreenComponentProps } from './types'

// returnTo is threaded so org scope survives the hop back to the code step.
export async function StudyResultsScreen({ study, orgSlug, returnTo }: ScreenComponentProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()

    return <StudyDetailsResearcher orgSlug={orgSlug} study={study} job={job} returnTo={returnTo} />
}
