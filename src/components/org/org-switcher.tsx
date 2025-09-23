'use client'

import { FC } from 'react'
import { Flex, Select, Text } from '@mantine/core'
import { useSession } from '@/hooks/session'

import { useUser } from '@clerk/nextjs'
import { useEnvironmentId } from '@/hooks/environment'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { useRouter } from 'next/navigation'

export const OrgSwitcher: FC = () => {
    const { session } = useSession()
    const { user, isLoaded } = useUser()
    const env = useEnvironmentId()
    const router = useRouter()

    if (!isLoaded || !env || !user) return null

    const info = (user.publicMetadata[env] as UserInfo) || null
    if (!info) return null

    const orgs = info.orgs || {}

    if (Object.keys(orgs).length < 2) {
        return null
    }

    const onChange = (value: string | null) => {
        if (!user) throw new Error('User is not loaded')
        if (!value) return
        // TODO: extract this to a updatePrefs function
        user.update({
            unsafeMetadata: {
                ...user.unsafeMetadata,
                [`${env}`]: {
                    currentOrgSlug: value,
                },
            },
        }).then(() => {
            if (value == CLERK_ADMIN_ORG_SLUG) {
                router.push(`/admin/safeinsights`)
            } else {
                router.push('/')
            }
        })
    }

    return (
        <Flex mx="sm" direction="column">
            <Text c="white">Switch org:</Text>
            <Select c="white" data={Object.keys(orgs)} value={session?.org.slug || ''} onChange={onChange} />
        </Flex>
    )
}
