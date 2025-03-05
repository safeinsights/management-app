import { Breadcrumbs, Anchor, Text } from '@mantine/core'
import Link from 'next/link'

export const PageBreadcrumbs: React.FC<{
    crumbs: Array<[string, string?]>
}> = ({ crumbs }) => {
    return (
        <Breadcrumbs separator=">">
            {crumbs.map(([title, href], index) =>
                href ? (
                    <Anchor component={Link} href={href} key={index}>
                        {title}
                    </Anchor>
                ) : (
                    <Text key={index}>{title}</Text>
                ),
            )}
        </Breadcrumbs>
    )
}

export const MemberBreadcrumbs: React.FC<{
    crumbs: {
        memberIdentifier: string
        studyTitle?: string
        studyIdentifier?: string
        current?: string
    }
}> = ({ crumbs: { memberIdentifier, studyIdentifier, studyTitle, current } }) => {
    const crumbs: Array<[string, string?]> = [['Dashboard', `/member/${memberIdentifier}/dashboard`]]
    if (studyTitle && studyIdentifier) {
        crumbs.push([studyTitle, `/member/${memberIdentifier}/study/${studyIdentifier}/review`])
    }
    if (current) {
        crumbs.push([current])
    }
    return <PageBreadcrumbs crumbs={crumbs} />
}

export const ResearcherBreadcrumbs: React.FC<{
    crumbs: {
        memberIdentifier?: string
        studyTitle?: string
        encodedStudyId?: string
        current?: string
    }
}> = ({ crumbs: { encodedStudyId, studyTitle, current } }) => {
    const crumbs: Array<[string, string?]> = [['All Studies', `/researcher/studies`]]
    if (studyTitle && encodedStudyId) {
        crumbs.push([studyTitle, `/researcher/study/${encodedStudyId}/review`])
    }
    if (current) {
        crumbs.push([current])
    }
    return <PageBreadcrumbs crumbs={crumbs} />
}
