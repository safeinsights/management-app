import React from 'react'
import { Alert, Button, Flex, Paper, Text, Title } from '@mantine/core'
import { getPendingStudyRunAction } from './actions'
import Link from 'next/link'
import { CopyingInput } from '@/components/copying-input'
import { AlertNotFound } from '@/components/alerts'
import { uuidToB64 } from '@/server/uuid'

const repoFromLocation = (loc: string) => {
    const u = new URL(`http://${loc}`)
    return u.pathname.slice(1)
}

export default async function UploadPage({
    params: { memberIdentifier, encodedStudyId },
}: {
    params: { memberIdentifier: string; encodedStudyId: string }
}) {
    const study = await getPendingStudyRunAction({ memberIdentifier, encodedStudyId })

    if (!study?.pendingRunId) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const repo = repoFromLocation(study.containerLocation)
    const tag = uuidToB64(study.pendingRunId)

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Title mb="lg">Upload your code to {study.memberName}</Title>

            <Alert color="blue" title="Steps have been skipped" mb="lg">
                Communication with member
            </Alert>

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

            <CopyingInput value={`docker repo ${repo}:${tag} ${study.containerLocation}:${tag}`} />

            <Text>Run the following command to push the image:</Text>
            <CopyingInput value={`docker push 905418271997.dkr.ecr.us-east-1.amazonaws.com/${repo}:${tag}`} />

            <Title my="lg" order={3}>
                Once you have pushed your image, proceed to complete and submit your research proposal.
            </Title>
            <Flex justify="end" mt="lg">
                <Link href="edit" passHref>
                    <Button>Proceed</Button>
                </Link>
            </Flex>
        </Paper>
    )
}
