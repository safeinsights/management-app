'use client'

import { FC } from 'react'
import { Group } from '@mantine/core'
import { OrganizationSwitcher } from '@clerk/nextjs'
import { useHasMultipleRoles } from '../org-info'

export const OrgSwitcher: FC = () => {
    const isMultiple = useHasMultipleRoles()

    if (!isMultiple) return null
    return (
        <Group justify="left" pl="xs" c="white">
            <OrganizationSwitcher
                    afterSelectOrganizationUrl="/"
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
