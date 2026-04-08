import { Breadcrumbs, Text, Divider } from '@mantine/core'
import { FC } from 'react'
import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { Link } from '@/components/links'

export const PageBreadcrumbs: FC<{
    crumbs: Array<[string, string?]>
}> = ({ crumbs }) => {
    return (
        <>
            <Breadcrumbs separator="/">
                {crumbs.map(([title, href], index) =>
                    href ? (
                        <Link
                            c="blue.7"
                            href={href as Route}
                            key={index}
                            style={{
                                display: 'inline-block',
                                maxWidth: 300,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {title}
                        </Link>
                    ) : (
                        <Text
                            c="grey.5"
                            key={index}
                            style={{
                                maxWidth: 300,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
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
    const crumbs: Array<[string, string?]> = [['Dashboard', Routes.dashboard]]
    if (studyTitle && studyId) {
        crumbs.push([studyTitle, Routes.studyView({ orgSlug, studyId })])
    }
    if (current) {
        crumbs.push([current])
    }
    return <PageBreadcrumbs crumbs={crumbs} />
}
