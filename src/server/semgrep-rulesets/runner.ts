import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { env } from '@/server/config'
import { gateResponseSchema, type GateResponse } from '../../../services/semgrep-runner/protocol'

// Below the 350 s after which the NAT gateway drops an idle connection. A gate runs Semgrep on rules
// and fixtures only, which takes well under a minute.
export const GATE_INVOKE_TIMEOUT_MS = 5 * 60_000

export type SemgrepRunnerFailure = 'runner-failed' | 'runner-timeout' | 'runner-response-invalid'

export class SemgrepRunnerFailed extends Error {
    name = 'SemgrepRunnerFailed'
    readonly code: SemgrepRunnerFailure

    constructor(code: SemgrepRunnerFailure, options?: { cause?: unknown }) {
        super(code, options)
        this.code = code
    }
}

// One attempt: an SDK retry would run the gate twice and could outlast the worker's timeout.
let client: LambdaClient | null = null
const lambdaClient = () => (client ??= new LambdaClient({ region: env.AWS_REGION || 'us-east-1', maxAttempts: 1 }))

function parseGateResponse(payload: Uint8Array | undefined): GateResponse {
    try {
        return gateResponseSchema.parse(JSON.parse(new TextDecoder().decode(payload)))
    } catch (error) {
        throw new SemgrepRunnerFailed('runner-response-invalid', { cause: error })
    }
}

export async function invokeGate(version: string, functionName: string): Promise<GateResponse> {
    const signal = AbortSignal.timeout(GATE_INVOKE_TIMEOUT_MS)
    let result
    try {
        result = await lambdaClient().send(
            new InvokeCommand({
                FunctionName: functionName,
                Payload: JSON.stringify({ mode: 'gate', rulesetVersion: version }),
            }),
            { abortSignal: signal },
        )
    } catch (error) {
        if (signal.aborted) throw new SemgrepRunnerFailed('runner-timeout', { cause: error })
        throw error
    }
    if (result.FunctionError) throw new SemgrepRunnerFailed('runner-failed')
    return parseGateResponse(result.Payload)
}
