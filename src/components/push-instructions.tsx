import { Title, Text } from '@mantine/core'
import { CopyingInput } from './copying-input'
import { uuidToB64 } from '@/lib/uuid'

const repoFromLocation = (loc: string) => {
    const u = new URL(`http://${loc}`)
    return u.pathname.slice(1)
}

export const PushInstructions = ({ containerLocation, runId }: { containerLocation: string; runId: string }) => {
    const repo = repoFromLocation(containerLocation)
    const tag = uuidToB64(runId)

    return (
        <>
            <Title my="lg" order={3}>
                Use the following steps to authenticate and push your code:
            </Title>

            <Text>Authenticate Docker using the AWS CLI:</Text>

            <CopyingInput value="aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 905418271997.dkr.ecr.us-east-1.amazonaws.com" />
            <Text>
                Note: If you receive an error using the AWS CLI, make sure that you have the latest version of the AWS
                CLI and Docker installed.
            </Text>
            <Text mt="lg">
                Build your Docker image using the following command. For information on building a Docker file from
                scratch see the instructions{' '}
                <a
                    href="https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-container-image.html"
                    target="_blank"
                >
                    here
                </a>
                . You can skip this step if your image is already built:
            </Text>

            <CopyingInput value={`docker build -t ${repo} .`} />
            <Text>After the build completes, repo your image so you can push the image to this repository:</Text>

            <CopyingInput value={`docker repo ${repo}:${tag} ${containerLocation}:${tag}`} />

            <Text>Run the following command to push the image:</Text>
            <CopyingInput value={`docker push 905418271997.dkr.ecr.us-east-1.amazonaws.com/${repo}:${tag}`} />
        </>
    )
}
