'use server'

import React from 'react'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { MemberDashboard } from './member-dashboard'
import { db } from '@/database'

export default async function MemberDashboardPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params

    const { memberIdentifier } = params

    const member = await getMemberFromIdentifier(memberIdentifier)

    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    return <MemberDashboard member={member} />
}
