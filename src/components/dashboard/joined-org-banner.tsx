'use client'

import { JOINED_ORG_STORAGE_KEY, readJoinedOrg, type JoinedOrg } from '@/lib/joined-org'
import { Alert, Text } from '@mantine/core'
import { InfoIcon } from '@phosphor-icons/react'
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
            variant="filled"
            color={semanticColor('info.bg.dark')}
            withCloseButton
            onClose={() => setJoinedOrg(null)}
            icon={<InfoIcon weight="fill" size={20} color={semanticColor('text.white')} />}
            data-testid="joined-org-banner"
        >
            <Text size="sm" c={semanticColor('text.white')} fw={fontWeight.semibold}>
                {bannerMessage(joinedOrg)}
            </Text>
        </Alert>
    )
}
