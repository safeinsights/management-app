import type { Metadata } from 'next'
import { Card, Divider, Flex, Paper, Text } from '@mantine/core'
import { EyeIcon } from '@phosphor-icons/react/dist/ssr'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { env } from '@/server/config'

export const metadata: Metadata = { title: 'About' }

export const dynamic = 'force-dynamic'

const Stat = ({ title, value }: { title: string; value: React.ReactNode }) => (
    <>
        <Text component="div" fz="lg" fw={fontWeight.semibold}>
            {title}:
        </Text>
        <Text component="div" fz="md" fw={fontWeight.bold}>
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
    const tag = env.RELEASE_TAG
    const sha = env.RELEASE_SHA
    if (!tag && !sha) {
        return 'not deployed'
    }
    const path = tag ? `releases/tag/${tag}` : `commit/${sha}`

    return <GithubLink repo="management-app" path={path} label={tag || sha || ''} />
}

const IacVersionLink = () => {
    const version = env.IAC_VERSION
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
    const sha = env.EDITOR_RELEASE_SHA
    if (!sha) {
        return 'not deployed'
    }

    return <GithubLink repo="management-app" path={`commit/${sha}`} label={sha} />
}

export default function AboutPage() {
    return (
        <Paper
            bg={semanticColor('surface.tableheader')}
            shadow="none"
            p="sm"
            mt="xl"
            radius="sm"
            miw={500}
            maw={800}
            mx="auto"
        >
            <Card withBorder radius="md" padding="xl" bg="var(--mantine-color-body)">
                <Stat title="Release" value={<TagLink />} />

                <Divider my="md" />

                <Stat title="Editor Release" value={<EditorReleaseLink />} />

                <Divider my="md" />

                <Stat title="Infrastructure" value={<IacVersionLink />} />

                <Divider my="md" />

                <Stat title="S3 Bucket" value={env.BUCKET_NAME || 'none'} />

                <Divider my="md" />

                <Stat title="Containerizer" value={env.CONTAINERIZER_PROJECT_NAME || 'none'} />

                <Divider my="md" />

                <Stat title="Scanner" value={env.SCANNER_PROJECT_NAME || 'none'} />

                <Divider my="md" />

                <Stat title="Container Repo" value={env.CODE_BUILD_REPOSITORY_DOMAIN || 'none'} />

                <Divider my="md" />

                <Stat title="Clerk Key" value={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'none'} />
            </Card>
        </Paper>
    )
}
