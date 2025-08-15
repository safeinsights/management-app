'use client'

import { Breadcrumbs, Anchor, Text, Divider } from '@mantine/core'
import Link from 'next/link'
import { FC } from 'react'
import { useUser } from '@clerk/nextjs'

export type Crumb = { title: string; href?: string }

export const PageBreadcrumbs: FC<{ crumbs: Crumb[] }> = ({ crumbs }) => {
    const { user, isLoaded } = useUser()

    const lastDashboardUrl = user?.unsafeMetadata?.lastDashboardUrl as string | undefined
    const dashboardUrl = lastDashboardUrl || '/researcher/dashboard'

    const allCrumbs: Crumb[] = [{ title: 'Dashboard', href: dashboardUrl }, ...crumbs]

    if (!isLoaded) {
        return null
    }

    return (
        <>
            <Breadcrumbs separator="/">
                {allCrumbs.map((crumb, index) =>
                    crumb.href ? (
                        <Anchor
                            c="blue.7"
                            component={Link}
                            href={crumb.href}
                            key={index}
                            style={{ whiteSpace: 'normal', wordBreak: 'break-word' }} //mobile breadcrumb overflows
                        >
                            {crumb.title}
                        </Anchor>
                    ) : (
                        <Text c="grey.5" key={index} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {crumb.title}
                        </Text>
                    ),
                )}
            </Breadcrumbs>
            <Divider />
        </>
    )
}
