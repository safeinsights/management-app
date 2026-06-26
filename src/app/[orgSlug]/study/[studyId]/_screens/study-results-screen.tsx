import { notFound } from 'next/navigation'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { StudyDetailsResearcher } from '../view/study-details-researcher'
import type { ScreenComponentProps } from './types'
import type { Route } from 'next'

// study-results: terminal results page. Loads the latest submitted job for the results message.
// No "Previous" — results is terminal (the descriptor carries no back).
// dashboardHref is already computed with returnTo baked in by the page dispatch.
export async function StudyResultsScreen({ study, orgSlug, dashboardHref }: ScreenComponentProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()

    return <StudyDetailsResearcher orgSlug={orgSlug} study={study} job={job} dashboardHref={dashboardHref as Route} />
}
