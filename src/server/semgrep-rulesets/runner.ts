import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { z } from 'zod'
import { env } from '@/server/config'
import {
    gateResponseSchema,
    semgrepTestsResultSchema,
    type GateResponse,
    type TestRequest,
    type TestResponse,
} from '../../../services/semgrep-runner/protocol'

// Below the 350 s after which the NAT gateway drops an idle connection. A gate runs Semgrep on rules
// and fixtures only, which takes well under a minute.
export const GATE_INVOKE_TIMEOUT_MS = 5 * 60_000

// A test run answers a server action, and the app Lambda times out after 30 s.
export const TEST_INVOKE_TIMEOUT_MS = 25_000

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

const testResponseSchema = z.looseObject({
    mode: z.literal('test'),
    outcome: z.enum(['FINDINGS-FOUND', 'NO-FINDINGS', 'PARTIALLY-SCANNED', 'NOTHING-SCANNED', 'DID-NOT-COMPLETE']),
    log: z.string(),
    findings: z.array(
        z.looseObject({
            check_id: z.string(),
            path: z.string(),
            start: z.looseObject({ line: z.number() }),
            extra: z.looseObject({ severity: z.string(), message: z.string() }),
        }),
    ),
    errors: z.array(z.looseObject({ message: z.string().optional(), path: z.string().optional() })),
    tests: semgrepTestsResultSchema.nullable(),
})

async function invokeRunner<T>(
    functionName: string,
    request: object,
    timeoutMs: number,
    schema: z.ZodType<unknown>,
): Promise<T> {
    const signal = AbortSignal.timeout(timeoutMs)
    let result
    try {
        result = await lambdaClient().send(
            new InvokeCommand({ FunctionName: functionName, Payload: JSON.stringify(request) }),
            { abortSignal: signal },
        )
    } catch (error) {
        if (signal.aborted) throw new SemgrepRunnerFailed('runner-timeout', { cause: error })
        throw error
    }
    if (result.FunctionError) throw new SemgrepRunnerFailed('runner-failed')
    try {
        return schema.parse(JSON.parse(new TextDecoder().decode(result.Payload))) as T
    } catch (error) {
        throw new SemgrepRunnerFailed('runner-response-invalid', { cause: error })
    }
}

export const invokeGate = (version: string, functionName: string) =>
    invokeRunner<GateResponse>(
        functionName,
        { mode: 'gate', rulesetVersion: version },
        GATE_INVOKE_TIMEOUT_MS,
        gateResponseSchema,
    )

export const invokeTest = (request: TestRequest, functionName: string) =>
    invokeRunner<TestResponse>(functionName, request, TEST_INVOKE_TIMEOUT_MS, testResponseSchema)
