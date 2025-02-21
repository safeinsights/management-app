'use client'

import { useUser } from '@clerk/nextjs'
import { Anchor, Divider, List, ListItem, LoadingOverlay, Stack, Text, Title, Tooltip } from '@mantine/core'
import React, { FC } from 'react'
import { Member } from '@/schema/member'
import { StudiesTable } from '@/components/member/studies-table'
import Link from 'next/link'

export const MemberDashboard: FC<{ member: Member }> = ({ member }) => {
    const { isLoaded, user } = useUser()

    if (!isLoaded) {
        return <LoadingOverlay />
    }

    return (
        <Stack px="lg" py="xl" gap="lg">
            <Title>Hi {user?.firstName}!</Title>
            <Text>Welcome to SafeInsights</Text>
            <Text>
                We’re so glad to have you. This space was built with your journey in mind. Your contributions are
                essential to maintaining a trusted and secure research environment, and in here, you can easily find and
                review researcher studies submitted to your organization. We’re continuously iterating to improve your
                experience, and we welcome your feedback to help shape the future of SafeInsights.
            </Text>
            <List>
                <ListItem>
                    <Text span>Build your secure enclave. </Text>
                    {/* TODO Figure out where this link needs to go */}
                    <Anchor component={Link} href="#">
                        Access your start up kit
                    </Anchor>
                </ListItem>
                <ListItem>
                    <Text span>Review and approve a study. </Text>
                    <Tooltip
                        multiline
                        withArrow
                        w={350}
                        label="You’ll receive an email when a study is submitted for review. Each study includes two parts: the proposal and the code. As a reviewer, you’ll check if both align with the data provided by your organization and decide whether to approve or reject them. Once both the proposal and code are approved, the researcher’s container will be exposed to the data, and outputted results shared with you for a final review before they are shared with the Researcher"
                    >
                        <Anchor component={Link} href="#">
                            Explore the process
                        </Anchor>
                    </Tooltip>
                </ListItem>
            </List>
            <Divider />
            <StudiesTable member={member} />
        </Stack>
    )
}
