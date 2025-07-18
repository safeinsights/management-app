'use client'

import { FC } from 'react'
import { Select } from '@mantine/core'
import { useSession } from '@/hooks/session'

import { useUser } from '@clerk/nextjs'
import { useEnvironmentId } from '@/hooks/environment'

export const OrgSwitcher: FC = () => {
    const { session } = useSession()
    const { user, isLoaded } = useUser()
    const env = useEnvironmentId()

    if (!isLoaded || !env || !user) return null

    const info = (user.publicMetadata[env] as UserInfo) || null
    if (!info) return null

    const teams = info.teams || {}

    if (Object.keys(teams).length < 2) {
        return null
    }

    const onChange = (value: string | null) => {
        if (!user) throw new Error('User is not loaded')
        if (!value) return

        user.update({
            unsafeMetadata: {
                ...user.unsafeMetadata,
                currentTeamSlug: value,
            },
        })
    }

    return <Select pl="xs" c="white" data={Object.keys(teams)} value={session?.team.slug || ''} onChange={onChange} />
}
