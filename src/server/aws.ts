import 'server-only'

import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { ECRClient, CreateRepositoryCommand, CreateRepositoryCommandInput, ECRClientConfig } from '@aws-sdk/client-ecr'
import { fromIni } from '@aws-sdk/credential-providers'
import { slugify } from '@/lib/util'
import { uuidToB64 } from './uuid'

export function generateRepositoryPath(opts: { memberIdentifier: string; studyId: string; studyTitle: string }) {
    return `si/analysis/${opts.memberIdentifier}/${uuidToB64(opts.studyId)}/${slugify(opts.studyTitle)}`
}

export class ECR {
    defaultTags: Record<string, string> = {
        Environemnt: 'sandbox',
    }

    client: ECRClient

    constructor() {
        const config: ECRClientConfig = { region: 'us-east-1' }
        if (process.env.AWS_PROFILE) {
            config.credentials = fromIni({ profile: process.env.AWS_PROFILE })
        }
        this.client = new ECRClient(config)
    }

    async createAnalysisRepository(repositoryName: string, tags: Record<string, string> = {}) {
        const input: CreateRepositoryCommandInput = {
            repositoryName,
            tags: Object.entries(Object.assign(tags, this.defaultTags)).map(([Key, Value]) => ({ Key, Value })),
        }
        const command = new CreateRepositoryCommand(input)
        const resp = await this.client.send(command)
        if (!resp?.repository?.repositoryUri) {
            throw new Error('Failed to create repository')
        }
        return resp.repository.repositoryUri
    }
}

export const getAWSInfo = async () => {
    const region = process.env.AWS_REGION || 'us-east-1'
    if (process.env.AWS_ACCOUNT_ID) {
        return { accountId: process.env.AWS_ACCOUNT_ID, region }
    }
    const client = new STSClient({})
    const command = new GetCallerIdentityCommand({})
    const response = await client.send(command)
    const accountId = response.Account
    if (!accountId) throw new Error('Failed to get AWS account ID')

    return {
        accountId,
        region,
    }
}
