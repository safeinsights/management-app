import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { CODER_DISABLED, env } from '@/server/config'

// Written by iac's ManagementAppMicrovmStack.
const CONFIG_PARAMETER = '/safeinsights/microvm-ide'

export type MicrovmConfig = {
    // The hash of the IDE layer that every image carries. An image built on another hash is rebuilt.
    layerHash: string
    layerSourceUri: string
    // A code environment's image is named this plus the hash of its url.
    imageNamePrefix: string
    baseRepositoryName: string
    // The one image every study's IDE runs: SafeInsights' own, with the editor and its extensions.
    imageArn: string
    // Where runner VMs log.
    runnerLogGroup: string
    executionRoleArn: string
    egressConnectorArn: string
    sampleDataSecrets: string[]
    workspacesBucket: string
    logGroup: string
    ideDomain: string
    claudeApiKeySecret: string
    // HMAC key for launch tokens, which the IDE's CloudFront login function verifies.
    launchTokenSecret: string
}

let configPromise: Promise<MicrovmConfig | null> | undefined

const loadConfig = async (): Promise<MicrovmConfig> => {
    const { Parameter } = await new SSMClient().send(new GetParameterCommand({ Name: CONFIG_PARAMETER }))
    return JSON.parse(Parameter!.Value!)
}

// Set by iac's ManagementAppStack where the research IDE runs in Lambda MicroVMs instead of Coder.
export const isMicrovmBackend = () => !CODER_DISABLED && env.IDE_BACKEND === 'microvm'

// `fresh` is for the callers that act on layerHash: a deploy changes it while this instance stays warm,
// and a build or a reconcile on the old value would undo what an instance with the new one did.
export function getMicrovmConfig(opts: { fresh?: boolean } = {}): Promise<MicrovmConfig | null> {
    if (!isMicrovmBackend()) return Promise.resolve(null)
    if (opts.fresh) configPromise = undefined
    // A failed load is not cached, so the next request retries instead of falling back to Coder.
    configPromise ??= loadConfig().catch((e) => {
        configPromise = undefined
        throw e
    })
    return configPromise
}
