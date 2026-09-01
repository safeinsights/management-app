import { Card, Divider, Flex, Paper, Text } from '@mantine/core'
import { EyeIcon } from '@phosphor-icons/react/dist/ssr'

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

const GithubLink = ({ repo, path, label }: { repo: string; path: string; label: string }) => (
    <a href={`https://github.com/safeinsights/${repo}/${path}`} target="_blank" rel="noopener noreferrer">
        <Flex gap="md" align={'center'}>
            <span>{label}</span>
            <EyeIcon />
        </Flex>
    </a>
)

const TagLink = () => {
    const tag = process.env.RELEASE_TAG
    const sha = process.env.RELEASE_SHA
    if (!tag && !sha) {
        return 'not deployed'
    }
    const path = tag ? `releases/tag/${tag}` : `commit/${sha}`

    return <GithubLink repo="management-app" path={path} label={tag || sha || ''} />
}

const IacVersionLink = () => {
    const version = process.env.IAC_VERSION
    if (!version) {
        return 'not deployed'
    }
    // `git describe` can decorate the SHA (`-N-g<sha>`, `-dirty`, or 'unknown'); those are not
    // valid refs, so only link a plain SHA.
    if (!/^[0-9a-f]{7,40}$/.test(version)) {
        return version
    }

    return <GithubLink repo="iac" path={`commit/${version}`} label={version} />
}

// Diverges from the release above when the editor was unchanged: its image is tagged by content
// hash, so an untouched editor keeps serving an earlier release's image.
const EditorReleaseLink = () => {
    const sha = process.env.EDITOR_RELEASE_SHA
    if (!sha) {
        return 'not deployed'
    }

    return <GithubLink repo="management-app" path={`commit/${sha}`} label={sha} />
}

export default function AboutPage() {
    return (
        <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm" miw={500} maw={800} mx="auto">
            <Card withBorder radius="md" padding="xl" bg="var(--mantine-color-body)">
                <Stat title="Release" value={<TagLink />} />

                <Divider my="md" />

                <Stat title="Editor Release" value={<EditorReleaseLink />} />

                <Divider my="md" />

                <Stat title="Infrastructure" value={<IacVersionLink />} />

                <Divider my="md" />

                <Stat title="S3 Bucket" value={process.env.BUCKET_NAME || 'none'} />

                <Divider my="md" />

                <Stat title="Containerizer" value={process.env.CONTAINERIZER_PROJECT_NAME || 'none'} />

                <Divider my="md" />

                <Stat title="Scanner" value={process.env.SCANNER_PROJECT_NAME || 'none'} />

                <Divider my="md" />

                <Stat title="Container Repo" value={process.env.CODE_BUILD_REPOSITORY_DOMAIN || 'none'} />

                <Divider my="md" />

                <Stat title="Clerk Key" value={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'none'} />
            </Card>
        </Paper>
    )
}
