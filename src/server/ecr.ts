import 'server-only'

import { ECRClient, CreateRepositoryCommand, CreateRepositoryCommandInput, ECRClientConfig } from '@aws-sdk/client-ecr'
import { fromIni } from '@aws-sdk/credential-providers'
import { slugify } from '@/lib/util'

export function generateRepositoryPath(memberIdentifier: string, studyTitle: string) {
    return `si/analysis/${memberIdentifier}/${slugify(studyTitle)}`
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
