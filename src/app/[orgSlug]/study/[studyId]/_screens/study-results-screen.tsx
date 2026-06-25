import { notFound } from 'next/navigation'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { StudyDetailsResearcher } from '../view/study-details-researcher'
import type { ScreenComponentProps } from './types'
import type { Route } from 'next'

// study-results: results page. Loads the latest submitted job for the results message. OTTER-614:
// "Previous" walks back to the approved-code step (the container builds /view?step=code); returnTo
// is threaded so org scope survives the hop. dashboardHref already has returnTo baked in.
export async function StudyResultsScreen({ study, orgSlug, dashboardHref, returnTo }: ScreenComponentProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()

    return (
        <StudyDetailsResearcher
            orgSlug={orgSlug}
            study={study}
            job={job}
            dashboardHref={dashboardHref as Route}
            returnTo={returnTo}
        />
    )
}
