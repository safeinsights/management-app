import { Paper, Card, Text, Divider } from '@mantine/core'

export const dynamic = 'force-dynamic'

const Stat = ({ title, value }: { title: string; value: string }) => (
    <>
        <Text fz="lg" fw={500}>
            {title}:
        </Text>
        <Text fz="md" tt="uppercase" fw={700}>
            {value}
        </Text>
    </>
)

export default function AboutPage() {
    return (
        <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm" miw={500} maw={800} mx="auto">
            <Card withBorder radius="md" padding="xl" bg="var(--mantine-color-body)">
                <Stat title="Release SHA" value={process.env.RELEASE_SHA || 'unknown'} />

                <Divider my="md" />

                <Stat title="S3 Bucket" value={process.env.BUCKET_NAME || 'none'} />

                <Divider my="md" />

                <Stat title="Containerizer" value={process.env.CODE_BUILD_PROJECT_NAME || 'none'} />

                <Divider my="md" />

                <Stat title="Container Repo" value={process.env.CODE_BUILD_ECR_NAME || 'none'} />
            </Card>
        </Paper>
    )
}
