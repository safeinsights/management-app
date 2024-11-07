import { Breadcrumbs, Anchor, Text } from '@mantine/core'
import Link from 'next/link'

export const PageBreadcrumbs: React.FC<{
    crumbs: Array<[string, string?]>
}> = ({ crumbs }) => {
    return (
        <Breadcrumbs mb={40} separator=">" separatorMargin="md">
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
    const crumbs: Array<[string, string?]> = [['All Studies', `/member/${memberIdentifier}/studies/review`]]
    if (studyTitle && studyIdentifier) {
        crumbs.push([studyTitle, `/member/${memberIdentifier}/studies/${studyIdentifier}/review`])
    }
    if (current) {
        crumbs.push([current])
    }
    return <PageBreadcrumbs crumbs={crumbs} />
}
