import { Breadcrumbs, Anchor, Text, Divider } from '@mantine/core'
import Link from 'next/link'
import type { Route } from 'next'
import { FC } from 'react'
import { Routes } from '@/lib/routes'

export const PageBreadcrumbs: FC<{
    crumbs: Array<[string, string?]>
}> = ({ crumbs }) => {
    return (
        <>
            <Breadcrumbs separator="/">
                {crumbs.map(([title, href], index) =>
                    href ? (
                        <Anchor
                            c="blue.7"
                            component={Link}
                            href={href as Route}
                            key={index}
                            style={{ whiteSpace: 'normal', wordBreak: 'break-word' }} //mobile breadcrumb overflows
                        >
                            {title}
                        </Anchor>
                    ) : (
                        <Text c="grey.5" key={index} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {title}
                        </Text>
                    ),
                )}
            </Breadcrumbs>
            <Divider />
        </>
    )
}

export const OrgBreadcrumbs: FC<{
    crumbs: {
        orgSlug: string
        studyTitle?: string
        studyId?: string
        current?: string
    }
}> = ({ crumbs: { orgSlug, studyId, studyTitle, current } }) => {
    const crumbs: Array<[string, string?]> = [['Dashboard', Routes.orgDashboard({ orgSlug })]]
    if (studyTitle && studyId) {
        crumbs.push([studyTitle, Routes.studyReview({ orgSlug, studyId })])
    }
    if (current) {
        crumbs.push([current])
    }
    return <PageBreadcrumbs crumbs={crumbs} />
}

export const ResearcherBreadcrumbs: FC<{
    crumbs: {
        orgSlug: string
        studyTitle?: string
        studyId?: string
        current?: string
    }
}> = ({ crumbs: { orgSlug, studyId, studyTitle, current } }) => {
    const crumbs: Array<[string, string?]> = [['Dashboard', Routes.orgDashboard({ orgSlug })]]
    if (studyTitle && studyId) {
        crumbs.push([studyTitle, Routes.studyReview({ orgSlug, studyId })])
    }
    if (current) {
        crumbs.push([current])
    }
    return <PageBreadcrumbs crumbs={crumbs} />
}
