'use client'

import { JOINED_ORG_STORAGE_KEY } from '@/lib/joined-org'
import { userKeyExistsAction } from '@/server/actions/user-keys.actions'
import { Alert, Text, useMantineTheme } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

export function JoinedOrgBanner() {
    const theme = useMantineTheme()
    const [orgName, setOrgName] = useState<string | null>(null)

    // A keyless user mounts the dashboard transiently before RequireUserKey redirects them to key setup,
    // so wait on that same key check before spending the one-shot flag — otherwise the banner is consumed
    // on a screen the user is being moved off of. A fixed delay raced that redirect and lost (OTTER-639).
    useEffect(() => {
        const joined = sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)
        if (!joined) return

        const revealOnceKeyed = async () => {
            const hasKey = await userKeyExistsAction()
            if (hasKey !== true) return

            sessionStorage.removeItem(JOINED_ORG_STORAGE_KEY)
            setOrgName(joined)
        }
        // Anything short of a definite key — not yet keyed, or a check that failed — leaves the flag
        // in place for the dashboard the user actually lands on.
        revealOnceKeyed().catch(() => {})
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
