import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { CODER_DISABLED, ENVIRONMENT_ID } from '@/server/config'

// Environments whose IDE runs in Lambda MicroVMs instead of Coder. The trial runs in sandbox only.
const MICROVM_ENVIRONMENTS = ['sandbox']

// Written by iac's ManagementAppMicrovmStack.
const CONFIG_PARAMETER = '/safeinsights/microvm-ide'

export type MicrovmConfig = {
    imageArn: string
    executionRoleArn: string
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
    if (CODER_DISABLED || !MICROVM_ENVIRONMENTS.includes(ENVIRONMENT_ID)) return Promise.resolve(null)
    // A failed load is not cached, so the next request retries instead of falling back to Coder.
    configPromise ??= loadConfig().catch((e) => {
        configPromise = undefined
        throw e
    })
    return configPromise
}
