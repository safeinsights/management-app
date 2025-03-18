import React from 'react'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { MemberDashboard } from '@/components/member/member-dashboard'
import { db } from '@/database'
import { auth } from '@clerk/nextjs/server'
import { findOrCreateSiUserId } from '@/server/actions/user-actions'
import { ResultsWriter } from 'si-encryption/job-results'

export const dynamic = 'force-dynamic'

export default async function MemberDashboardPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params
    const { userId: clerkId } = await auth()
    // console.log(userId)
    if (!clerkId) return null

    const writer = new ResultsWriter([
        {
            fingerprint: '51127ad3bc2c74541eab0456b84bb6ac727576897b743922ab1d251daf9abf7f',
            publicKey:
                'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmrgkOz7LP1NRx16kGnT9Iluq0U1d+xQQE/BeW5a0tSftz6GVtYDKd5/wyH/vBpyo9jsOhKiJsvaraz4tYhHN64PUHdnecSYu2NoMgfOIoYcsKYBn5Pttp4o5/p22rZP0OhEWgIcBIqIjW9wwh/gQSdolBN+L4z3/zSOU24NHVs8yzVv87jfPoY/+WN3hycOcn4xJTvhLYM1jFtgbxwIa+GUFMobP8cmHX+MjRjBe+re4ggmmdQ3JkEDBDM2GzEYpoxIunZwvR4MCAY+Xw1VXlsZdbv7FBjnRrCvtooHyTUNvtpRaB1mo8lAC1qi8+zOqm3K0REY3gaV6Uu3FuAlXZwIDAQAB\n',
        },
    ])
    await writer.addFile('filename', new ArrayBuffer(2))
    console.log(writer)

    // await db.deleteFrom('memberUserPublicKey').execute()
    // console.log(await db.selectFrom('memberUserPublicKey').selectAll().execute())

    // const userId = await findOrCreateSiUserId(clerkId, 'unknown')

    // await db.deleteFrom('jobStatusChange').execute()
    // await db.deleteFrom('studyJob').execute()
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
