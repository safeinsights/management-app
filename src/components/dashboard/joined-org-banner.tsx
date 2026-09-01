'use client'

import { JOINED_ORG_STORAGE_KEY } from '@/lib/joined-org'
import { actionResult } from '@/lib/utils'
import { userKeyExistsAction } from '@/server/actions/user-keys.actions'
import { Alert, Text, useMantineTheme } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

export function JoinedOrgBanner() {
    const theme = useMantineTheme()
    const [orgName, setOrgName] = useState<string | null>(null)

    // A keyless user mounts the dashboard transiently before RequireUserKey redirects them, so
    // the one-shot flag waits on that same key check rather than a delay (OTTER-639).
    useEffect(() => {
        const joined = sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)
        if (!joined) return

        let cancelled = false
        const revealOnceKeyed = async () => {
            const hasKey = actionResult(await userKeyExistsAction())
            if (!hasKey || cancelled) return

            sessionStorage.removeItem(JOINED_ORG_STORAGE_KEY)
            setOrgName(joined)
        }
        // Anything short of a definite key leaves the flag for the dashboard they land on.
        revealOnceKeyed().catch(() => {})
        return () => {
            cancelled = true
        }
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
