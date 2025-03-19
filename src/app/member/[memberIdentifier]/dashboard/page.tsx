'use server'

import React from 'react'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { MemberDashboard } from '@/components/member/member-dashboard'

export default async function MemberDashboardPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params

    // TODO Needed for now to manually do job things
    // await db
    //     .insertInto('studyJob')
    //     .values({
    //         studyId: '0195a985-b231-7501-a3c9-ad8f41b6bd66',
    //         resultFormat: 'SI_V1_ENCRYPT',
    //     })
    //     .execute()

    // console.log(
    //     await db
    //         .selectFrom('studyJob')
    //         .selectAll()
    //         .where('studyId', '=', '0195a985-b231-7501-a3c9-ad8f41b6bd66')
    //         .execute(),
    // )

    const { memberIdentifier } = params

    const member = await getMemberFromIdentifier(memberIdentifier)

    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    // await db
    //     .insertInto('memberUser')
    //     .values({
    //         memberId: member.id,
    //         userId: userId,
    //         isAdmin: true,
    //         isReviewer: true,
    //     })
    //     .execute()

    return <MemberDashboard member={member} />
}
