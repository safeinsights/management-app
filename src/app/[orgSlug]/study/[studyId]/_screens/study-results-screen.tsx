import { notFound } from 'next/navigation'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { StudyDetailsResearcher } from '../view/study-details-researcher'
import type { ScreenComponentProps } from './types'

export async function StudyResultsScreen({ study, nav }: ScreenComponentProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()

    return <StudyDetailsResearcher study={study} job={job} nav={nav} />
}
