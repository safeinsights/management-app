import { Breadcrumbs, Anchor, Text, Divider, Stack } from '@mantine/core'
import Link from 'next/link'
import { FC } from 'react'
import { theme } from '../theme'

const prevColor = theme.colors.blue[7]
const currentColor = theme.colors.grey[5]

export const PageBreadcrumbs: FC<{
    crumbs: Array<[string, string?]>
}> = ({ crumbs }) => {
    return (
        <Breadcrumbs separator=">">
            {crumbs.map(([title, href], index) =>
                href ? (
                    <Anchor c={prevColor} component={Link} href={href} key={index}>
                        {title}
                    </Anchor>
                ) : (
                    <Text c={currentColor} key={index}>
                        {title}
                    </Text>
                ),
            )}
        </Breadcrumbs>
    )
}

export const MemberBreadcrumbs: FC<{
    crumbs: {
        memberSlug: string
        studyTitle?: string
        studyIdentifier?: string
        current?: string
    }
}> = ({ crumbs: { memberSlug, studyIdentifier, studyTitle, current } }) => {
    const crumbs: Array<[string, string?]> = [['Dashboard', `/member/${memberSlug}/dashboard`]]
    if (studyTitle && studyIdentifier) {
        crumbs.push([studyTitle, `/member/${memberSlug}/study/${studyIdentifier}/review`])
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
    return (
        <Stack>
            <PageBreadcrumbs crumbs={crumbs} /> <Divider />
        </Stack>
    )
}
