'use server'

import { AccessDeniedAlert } from '@/components/errors'
import { sessionFromClerk } from '@/server/clerk'
import { StudyProposal } from './proposal'

export default async function RequestStudyPage() {
    const session = await sessionFromClerk()
    if (!session) return <AccessDeniedAlert />

    return <StudyProposal />
}
