import { Paper, Card, Text, Divider, Flex } from '@mantine/core'
import { Eye } from '@phosphor-icons/react/dist/ssr'
export const dynamic = 'force-dynamic'

const Stat = ({ title, value }: { title: string; value: React.ReactNode }) => (
    <>
        <Text component="div" fz="lg" fw={500}>
            {title}:
        </Text>
        <Text component="div" fz="md" fw={700}>
            {value}
        </Text>
    </>
)

const TagLink = () => {
    const tag = process.env.RELEASE_TAG
    const sha = process.env.RELEASE_SHA
    if (!tag && !sha) {
        return 'not deployed'
    }
    const path = tag ? `releases/tag/${tag}` : `commit/${sha}`

    return (
        <a href={`https://github.com/safeinsights/management-app/${path}`} target="_blank" rel="noopener noreferrer">
            <Flex gap="md" align={'center'}>
                <span>{tag || sha}</span>
                <Eye />
            </Flex>
        </a>
    )
}

export default function AboutPage() {
    return (
        <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm" miw={500} maw={800} mx="auto">
            <Card withBorder radius="md" padding="xl" bg="var(--mantine-color-body)">
                <Stat title="Release" value={<TagLink />} />

                <Divider my="md" />

                <Stat title="S3 Bucket" value={process.env.BUCKET_NAME || 'none'} />

                <Divider my="md" />

                <Stat title="Containerizer" value={process.env.CODE_BUILD_PROJECT_NAME || 'none'} />

                <Divider my="md" />

                <Stat title="Container Repo" value={process.env.CODE_BUILD_REPOSITORY_DOMAIN || 'none'} />
            </Card>
        </Paper>
    )
}
