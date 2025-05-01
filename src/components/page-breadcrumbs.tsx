import { Breadcrumbs, Anchor, Text, Divider } from '@mantine/core'
import Link from 'next/link'
import { FC } from 'react'

export const PageBreadcrumbs: FC<{
    crumbs: Array<[string, string?]>
}> = ({ crumbs }) => {
    return (
        <>
            <Breadcrumbs separator=">">
                {crumbs.map(([title, href], index) =>
                    href ? (
                        <Anchor c="blue.7" component={Link} href={href} key={index}>
                            {title}
                        </Anchor>
                    ) : (
                        <Text c="grey.5" key={index}>
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
    const crumbs: Array<[string, string?]> = [['Dashboard', `/reviewer/${orgSlug}/dashboard`]]
    if (studyTitle && studyId) {
        crumbs.push([studyTitle, `/reviewer/${orgSlug}/study/${studyId}/review`])
    }
    if (current) {
        crumbs.push([current])
    }
    return <PageBreadcrumbs crumbs={crumbs} />
}

export const ResearcherBreadcrumbs: FC<{
    crumbs: {
        studyTitle?: string
        studyId?: string
        current?: string
    }
}> = ({ crumbs: { studyId, studyTitle, current } }) => {
    const crumbs: Array<[string, string?]> = [['Dashboard', `/researcher/dashboard`]]
    if (studyTitle && studyId) {
        crumbs.push([studyTitle, `/researcher/study/${studyId}/review`])
    }
    if (current) {
        crumbs.push([current])
    }
    return <PageBreadcrumbs crumbs={crumbs} />
}

export const AdminBreadcrumbs: FC<{
    crumbs: {
        current?: string
    }
}> = ({ crumbs: { current } }) => {
    const crumbs: Array<[string, string?]> = [['Dashboard', `/researcher/dashboard`], ['Admin']]
    if (current) {
        crumbs.push([current])
    }
    return <PageBreadcrumbs crumbs={crumbs} />
}
