import { execSync } from 'child_process'
import {
    ECRClient,
    DescribeImagesCommand,
    BatchDeleteImageCommand,
    BatchGetImageCommand,
    PutImageCommand,
} from '@aws-sdk/client-ecr'
import { LambdaClient, UpdateFunctionCodeCommand } from '@aws-sdk/client-lambda'
import { fromIni } from '@aws-sdk/credential-providers'
import dayjs from 'dayjs'

const exec = (command: string) => execSync(command, { stdio: 'inherit' })

const getCurrentDate = () => dayjs().format('YYYY-MM-DD')

// Function to build and tag the Docker image
const buildAndTagDockerImage = async (repository: string, tag: string) => {
    console.log(`Building Docker image and tagging with ${tag}`)
    exec(`docker build --file Dockerfile.prod --platform='linux/amd64' -t ${repository}:${tag} .`)
}

// Check if the tag exists on ECR
const tagExistsOnECR = async (ecrClient: ECRClient, repositoryName: string, tag: string): Promise<boolean> => {
    try {
        const data = await ecrClient.send(
            new DescribeImagesCommand({
                repositoryName,
                imageIds: [{ imageTag: tag }],
            }),
        )
        return (data.imageDetails?.length || 0) > 0
    } catch (error) {
        return false
    }
}

// Function to push the image to ECR
const pushDockerImageToECR = (repository: string, tag: string) => {
    console.log(`Pushing image ${repository}:${tag} to ECR`)
    exec(`docker push ${repository}:${tag}`)
}

// Update Lambda function to use the new image
const updateLambdaFunction = async (lambdaClient: LambdaClient, functionName: string, imageUri: string) => {
    console.log(`Updating Lambda function ${functionName} to use image ${imageUri}`)
    await lambdaClient.send(
        new UpdateFunctionCodeCommand({
            FunctionName: functionName,
            ImageUri: imageUri,
        }),
    )
    console.log('Lambda function updated successfully.')
}

async function swapLatestTag(ecrClient: ECRClient, repositoryName: string, latestTag: string, imageTag: string) {
    try {
        await ecrClient.send(
            new BatchDeleteImageCommand({
                repositoryName,
                imageIds: [{ imageTag: latestTag }],
            }),
        )
    } catch {
        console.log(`failed to remove "${latestTag}" tag, perhaps it doesn’t yet exist`)
    }

    const imgs = await ecrClient.send(
        new BatchGetImageCommand({
            repositoryName,
            imageIds: [{ imageTag }],
        }),
    )

    const imageManifest = imgs.images?.[0]?.imageManifest
    if (!imageManifest) {
        throw new Error('failed to get manifest for just pushed image')
    }
    // despite being named PutImageCommand, this really just adds the "latest" tag
    ecrClient.send(
        new PutImageCommand({
            repositoryName,
            imageManifest,
            imageTag: latestTag,
        }),
    )

    console.log(`tagged ${imageTag} as ${latestTag}`)
}
// Main function
async function main() {
    const profile = process.argv.includes('--profile') ? process.argv[process.argv.indexOf('--profile') + 1] : 'default'
    if (profile == 'default') {
        console.log('Using default profile, you may need to specify --profile')
    }
    const region = 'us-east-1' // TODO: pull this from profile?
    const environment = 'sandbox' // TODO: read from cli args or something
    const latestTag = `${environment}-latest`
    const repositoryName = 'mgmt-app-worker'
    const repository = '905418271997.dkr.ecr.us-east-1.amazonaws.com/mgmt-app-worker'

    exec(
        `aws --profile ${profile} ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${repository.split('/')[0]}`,
    )

    const functionName = 'ManagementApp'

    const credentials = fromIni({ profile })

    // Configure AWS SDK to use the given profile and region
    const ecrClient = new ECRClient({ region: region, credentials })
    const lambdaClient = new LambdaClient({ region: region, credentials })

    let imageTag = getCurrentDate()
    let suffix = 'a'

    // Check if the image tag already exists in ECR and increment if necessary
    while (await tagExistsOnECR(ecrClient, repositoryName, imageTag)) {
        imageTag = `${getCurrentDate()}-${suffix}`
        suffix = String.fromCharCode(suffix.charCodeAt(0) + 1) // Increment suffix (a -> b -> c ...)
    }

    buildAndTagDockerImage(repository, imageTag)
    pushDockerImageToECR(repository, imageTag)

    await updateLambdaFunction(lambdaClient, functionName, `${repository}:${imageTag}`)

    await swapLatestTag(ecrClient, repositoryName, latestTag, imageTag)
}

main().catch((error) => {
    process.stderr.write(`Error: ${error.message}\n`)
    process.exit(1)
})
