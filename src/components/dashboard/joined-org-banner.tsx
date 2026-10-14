'use client'

import { JOINED_ORG_STORAGE_KEY, readJoinedOrg, type JoinedOrg } from '@/lib/joined-org'
import { actionResult } from '@/lib/utils'
import { userKeyExistsAction } from '@/server/actions/user-keys.actions'
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

    // Waits on a definite key so a keyless account keeps the one-shot flag for the landing after
    // key setup (OTTER-639).
    useEffect(() => {
        const joined = readJoinedOrg()
        if (!joined) return

        let cancelled = false
        const revealOnceKeyed = async () => {
            const hasKey = actionResult(await userKeyExistsAction())
            if (!hasKey || cancelled) return

            sessionStorage.removeItem(JOINED_ORG_STORAGE_KEY)
            setJoinedOrg(joined)
        }
        // Anything short of a definite key leaves the flag for the dashboard they land on.
        revealOnceKeyed().catch(() => {})
        return () => {
            cancelled = true
        }
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
