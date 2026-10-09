import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { CODER_DISABLED } from '@/server/config'

// Written by iac's ManagementAppMicrovmStack.
const CONFIG_PARAMETER = '/safeinsights/microvm-ide'

export type MicrovmConfig = {
    imageArn: string
    executionRoleArn: string
    egressConnectorArn: string
    sampleDataSecrets: string[]
    workspacesBucket: string
    logGroup: string
    ideDomain: string
    claudeApiKeySecret: string
}

let configPromise: Promise<MicrovmConfig | null> | undefined

const loadConfig = async (): Promise<MicrovmConfig> => {
    const { Parameter } = await new SSMClient().send(new GetParameterCommand({ Name: CONFIG_PARAMETER }))
    return JSON.parse(Parameter!.Value!)
}

export function getMicrovmConfig(): Promise<MicrovmConfig | null> {
    // Set by iac's ManagementAppStack where the research IDE runs in Lambda MicroVMs instead of Coder.
    if (CODER_DISABLED || process.env.IDE_BACKEND !== 'microvm') return Promise.resolve(null)
    // A failed load is not cached, so the next request retries instead of falling back to Coder.
    configPromise ??= loadConfig().catch((e) => {
        configPromise = undefined
        throw e
    })
    return configPromise
}
