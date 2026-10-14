'use client'

import { JOINED_ORG_STORAGE_KEY, readJoinedOrg, type JoinedOrg } from '@/lib/joined-org'
import { Alert, Text } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { fontWeight, semanticColor } from '@/theme/tokens'

const bannerMessage = ({ orgName, linkedEmail }: JoinedOrg) =>
    linkedEmail
        ? `You have been added to ${orgName} and ${linkedEmail} is now linked to your account.`
        : `You have been added to ${orgName}.`

export function JoinedOrgBanner() {
    const [joinedOrg, setJoinedOrg] = useState<JoinedOrg | null>(null)

    useEffect(() => {
        const joined = readJoinedOrg()
        if (!joined) return

        sessionStorage.removeItem(JOINED_ORG_STORAGE_KEY)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is client-only
        setJoinedOrg(joined)
    }, [])

    if (!joinedOrg) return null

    return (
        <Alert
            color="green"
            withCloseButton
            onClose={() => setJoinedOrg(null)}
            icon={<CheckCircleIcon weight="fill" size={20} color={semanticColor('success.text')} />}
            data-testid="joined-org-banner"
        >
            <Text size="sm" c={semanticColor('success.text')} fw={fontWeight.bold}>
                {bannerMessage(joinedOrg)}
            </Text>
        </Alert>
    )
}
