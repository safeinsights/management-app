'use client'

import { FC } from 'react'
import { Group } from '@mantine/core'
import { OrganizationSwitcher } from '@clerk/nextjs'
import { useHasMultipleRoles } from '../org-info'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'

const onOrgSwitch = (org: { slug: string | null }): string => {
    if (org.slug === CLERK_ADMIN_ORG_SLUG) {
        return `/admin/safeinsights`
    }
    return `/reviewer/${org.slug}/dashboard`
}

export const OrgSwitcher: FC = () => {
    const isMultiple = useHasMultipleRoles()

    if (!isMultiple) return null

    return (
        <Group justify="left" pl="xs" c="white">
            <OrganizationSwitcher
                afterSelectOrganizationUrl={onOrgSwitch}
                afterSelectPersonalUrl={`/researcher/dashboard`}
                appearance={{
                    elements: {
                        rootBox: {
                            width: '100%',
                        },
                        organizationSwitcherTrigger: {
                            color: 'white !important',
                            '& span': { color: 'white !important' },
                            padding: `12px 10px`,
                            width: '100%',
                            borderRadius: '0',
                            '&:hover': {
                                backgroundColor: 'var(--mantine-color-blue-9)',
                            },
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        },
                        organizationPreview: {
                            gap: 'var(--mantine-spacing-sm)',
                        },
                    },
                }}
            />
        </Group>
    )
}
