import * as React from 'react'
import { db } from '@/database'
import { StudiesTable } from './studies-table'

export const dynamic = 'force-dynamic'

export default async function ResearcherDashboardPage(): Promise<React.ReactElement> {
    const studies = await db
        .selectFrom('study')
        .select(['study.id', 'title', 'piName', 'status', 'memberId', 'createdAt'])
        .orderBy('createdAt', 'desc')
        .execute()

    return <StudiesTable studies={studies} />
}
