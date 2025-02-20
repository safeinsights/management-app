import { Text, Stack, Paper } from '@mantine/core'
import { CopyingInput } from './copying-input'
import { uuidToB64 } from '@/lib/uuid'

const decodeLocation = (loc: string) => {
    const u = new URL(`http://${loc}`)

    return { host: u.hostname, repo: u.pathname.slice(1) }
}

export const PushInstructions = ({ containerLocation, jobId }: { containerLocation: string; jobId: string }) => {
    const { host, repo } = decodeLocation(containerLocation)
    const tag = uuidToB64(jobId)

    return (
        <>
            <Paper shadow="xs" p="md">
                <Stack align="left" mb="lg" mt="lg">
                    <Text>
                        1) Authenticate Docker <i>(assumes you have AWS_PROFILE env vars set)</i>:
                    </Text>
                    <CopyingInput
                        value={`aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${host}`}
                    />

                    <Text>2) Build Docker image:</Text>
                    <CopyingInput value={`docker build --platform=linux/amd64 -t ${repo}:${tag} .`} />

                    <Text>3) Tag Docker image:</Text>
                    <CopyingInput value={`docker tag ${repo}:${tag} ${containerLocation}:${tag}`} />

                    <Text>4) Push the image:</Text>
                    <CopyingInput value={`docker push ${host}/${repo}:${tag}`} />
                </Stack>
            </Paper>
        </>
    )
}
