'use client'

import { JOINED_ORG_STORAGE_KEY, readJoinedOrg, type JoinedOrg } from '@/lib/joined-org'
import { actionResult } from '@/lib/utils'
import { userKeyExistsAction } from '@/server/actions/user-keys.actions'
import { Alert, Text, useMantineTheme } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { fontWeight } from '@/theme/tokens'

const bannerMessage = ({ orgName, linkedEmail }: JoinedOrg) =>
    linkedEmail
        ? `You have been added to ${orgName} and ${linkedEmail} is now linked to your account.`
        : `You have been added to ${orgName}.`

export function JoinedOrgBanner() {
    const theme = useMantineTheme()
    const [joinedOrg, setJoinedOrg] = useState<JoinedOrg | null>(null)

    // A keyless user mounts the dashboard transiently before RequireUserKey redirects them, so
    // the one-shot flag waits on that same key check rather than a delay (OTTER-639).
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
            icon={<CheckCircleIcon weight="fill" size={20} color={theme.colors.green[7]} />}
            styles={{ closeButton: { color: theme.colors.green[7] } }}
            data-testid="joined-org-banner"
        >
            <Text size="sm" c={theme.colors.green[7]} fw={fontWeight.bold}>
                {bannerMessage(joinedOrg)}
            </Text>
        </Alert>
    )
}
