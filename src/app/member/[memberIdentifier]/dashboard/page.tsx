'use server'

import React from 'react'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { MemberDashboard } from './member-dashboard'

export default async function MemberDashboardPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params

    // TODO Needed for now to manually do job things
    // await db
    //     .insertInto('studyJob')
    //     .values({
    //         studyId: '0195b473-d3d3-777b-9de4-9946426710e1',
    //         resultFormat: 'SI_V1_ENCRYPT',
    //     })
    //     .execute()

    // await db.deleteFrom('userPublicKey').execute()
    // console.log(
    //     await db
    //         .selectFrom('studyJob')
    //         .selectAll()
    //         .where('studyId', '=', '0195b473-d3d3-777b-9de4-9946426710e1')
    //         .execute(),
    // )

    const { memberIdentifier } = params

    const member = await getMemberFromIdentifier(memberIdentifier)

    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    // const user = await siUser()
    // console.log('user', user)
    // await db
    //     .insertInto('memberUser')
    //     .values({
    //         memberId: member.id,
    //         userId: user.id,
    //         isAdmin: true,
    //         isReviewer: true,
    //     })
    //     .execute()

    return <MemberDashboard member={member} />
}
