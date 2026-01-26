import { notFound } from 'next/navigation'
import { sessionFromClerk } from '@/server/clerk'
import { getLabOrg } from '@/lib/types'
import { ResearcherProfileClientPage } from './researcher-profile.client'

export default async function ResearcherProfilePage() {
    // Researcher-only page (no OpenStax/SpyMode feature flag gating).
    const session = await sessionFromClerk()
    if (!session || !getLabOrg(session)) notFound()

    return <ResearcherProfileClientPage />
}
