'use client'

import { JOINED_ORG_STORAGE_KEY } from '@/lib/joined-org'
import { Alert, Text, useMantineTheme } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

// Defer the reveal so a keyless user's transient dashboard mount (before RequireUserKey redirects to
// key setup) unmounts first and cancels the timer, leaving the flag intact for the real landing.
export const REVEAL_DELAY_MS = 1200

export function JoinedOrgBanner() {
    const theme = useMantineTheme()
    const [orgName, setOrgName] = useState<string | null>(null)

    useEffect(() => {
        const joined = sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)
        if (!joined) return

        const timer = setTimeout(() => {
            sessionStorage.removeItem(JOINED_ORG_STORAGE_KEY)
            setOrgName(joined)
        }, REVEAL_DELAY_MS)

        return () => clearTimeout(timer)
    }, [])

    if (!orgName) return null

    return (
        <Alert
            color="green"
            withCloseButton
            onClose={() => setOrgName(null)}
            icon={<CheckCircleIcon weight="fill" size={20} color={theme.colors.green[9]} />}
            styles={{ closeButton: { color: theme.colors.green[9] } }}
            data-testid="joined-org-banner"
        >
            <Text size="sm" c={theme.colors.green[9]} fw={700}>{`You have been added to ${orgName}.`}</Text>
        </Alert>
    )
}
