import * as React from 'react';
import { ResearcherDashboard } from '@/components/researcher/researcher-dashboard'

export const dynamic = 'force-dynamic'

export default async function ResearcherDashboardPage(): Promise<React.ReactElement> {
    return <ResearcherDashboard />
}
