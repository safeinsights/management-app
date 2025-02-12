import React from 'react'
import { Button, CopyButton, Paper, Stack, Text, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { CopyingInput } from '@/components/copying-input'
import { PushInstructions } from '@/components/push-instructions'
import { useUser } from '@clerk/nextjs'
import { MemberDashboard } from '@/components/member/member-dashboard'

export const dynamic = 'force-dynamic'

export default async function MemberDashboardPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params

    const { memberIdentifier } = params

    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        // TODO Redirect here with a mantine notification? generic 404 page?
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    return <MemberDashboard member={member} />
}
