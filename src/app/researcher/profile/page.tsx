import { notFound } from 'next/navigation'
import { sessionFromClerk } from '@/server/clerk'
import { getLabOrg } from '@/lib/types'
import { ResearcherProfileClientPage } from './profile-form'

export default async function ResearcherProfilePage() {
    const session = await sessionFromClerk()
    if (!session || !getLabOrg(session)) notFound()

    return <ResearcherProfileClientPage />
}
