import React from 'react'
import { Paper, Text, Title } from '@mantine/core'
import { b64toUUID } from '@/server/uuid'
import { db } from '@/database'

import { CopyingInput } from './copying-input'
import { AlertNotFound } from '@/components/alerts'

const tagFromLocation = (loc: string) => {
    const u = new URL(`http://${loc}`)
    return u.pathname.slice(1)
}

export default async function MemberHome({
    params: { memberIdentifier, encodedStudyId },
}: {
    params: { memberIdentifier: string; encodedStudyId: string }
}) {
    const study = await db
        .selectFrom('study')
        .select(['title', 'containerLocation'])
        .innerJoin('member', 'member.id', 'study.memberId')
        .where('study.id', '=', b64toUUID(encodedStudyId))
        .where('member.identifier', '=', memberIdentifier)
        .executeTakeFirst()

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const tag = tagFromLocation(study.containerLocation)

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Title my="lg">Build and push an image to your studies repository</Title>

            <Title order={3}>Use the following steps to authenticate and push your code:</Title>

            <Text mt="md">Authenticate Docker using the AWS CLI:</Text>

            <CopyingInput value="aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 905418271997.dkr.ecr.us-east-1.amazonaws.com" />
            <Text>
                Note: If you receive an error using the AWS CLI, make sure that you have the latest version of the AWS
                CLI and Docker installed.
                <br />
                Build your Docker image using the following command. For information on building a Docker file from
                scratch see the instructions here . You can skip this step if your image is already built:
            </Text>

            <CopyingInput value={`docker build -t ${tag} .`} />
            <Text>After the build completes, tag your image so you can push the image to this repository:</Text>

            <CopyingInput
                value={`docker tag ${tag}:latest 905418271997.dkr.ecr.us-east-1.amazonaws.com/mgmt-app-worker:latest`}
            />

            <Text>Run the following command to push the image:</Text>
            <CopyingInput value={`docker push 905418271997.dkr.ecr.us-east-1.amazonaws.com/${tag}:latest`} />
        </Paper>
    )
}
