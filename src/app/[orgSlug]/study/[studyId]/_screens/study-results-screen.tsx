import { notFound } from 'next/navigation'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { StudyDetailsResearcher } from '../view/study-details-researcher'
import type { ScreenComponentProps } from './types'

// study-results: results page. OTTER-614: "Previous" walks back to the code step (/view/code);
// returnTo is threaded so org scope survives the hop.
export async function StudyResultsScreen({ study, orgSlug, returnTo }: ScreenComponentProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()

    return <StudyDetailsResearcher orgSlug={orgSlug} study={study} job={job} returnTo={returnTo} />
}
