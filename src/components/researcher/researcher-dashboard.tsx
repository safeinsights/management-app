import React from 'react'
import { db } from '@/database'
import { currentUser } from '@clerk/nextjs/server'
import {StudiesTable} from './studies-table'

export const dynamic = 'force-dynamic'

export async function RetrieveClerkUser() {
    const user = await currentUser()

    if (!user) {
        return { name: ' ', studies: [] }
    }

    const studies = await db
        .selectFrom('study')
        .select(['study.id', 'title', 'piName', 'status', 'memberId', 'createdAt'])
        .orderBy('createdAt', 'desc')
        .execute()

    return { 
        name: user.firstName|| '  ', 
        studies 
    }
}

export const ResearcherDashboard = async () => {
    const { name, studies } = await RetrieveClerkUser()

    return <StudiesTable userName={name} studies={studies} />
}

export default ResearcherDashboard
