import { InvokeCommand } from '@aws-sdk/client-lambda'
import { describe, expect, it, vi } from '@/tests/unit.helpers'
import { passingGate, RUNNER_FUNCTION, stubRunner } from '@/tests/semgrep-rules-s3.helpers'
import { invokeGate, SemgrepRunnerFailed } from './runner'

describe('invokeGate', () => {
    it('invokes the runner in gate mode and returns its response', async () => {
        const lambda = stubRunner()

        expect(await invokeGate('v3', RUNNER_FUNCTION)).toEqual(passingGate('v3'))
        expect(lambda.commandCalls(InvokeCommand)[0].args[0].input).toEqual({
            FunctionName: RUNNER_FUNCTION,
            Payload: JSON.stringify({ mode: 'gate', rulesetVersion: 'v3' }),
        })
    })

    it('maps a function error', async () => {
        stubRunner(() => ({ functionError: 'Task timed out' }))
        await expect(invokeGate('v3', RUNNER_FUNCTION)).rejects.toMatchObject({ code: 'runner-failed' })
    })

    it('maps a payload that is not a gate response', async () => {
        stubRunner(() => ({ payload: '{"mode":"scan"}' }))
        await expect(invokeGate('v3', RUNNER_FUNCTION)).rejects.toMatchObject({ code: 'runner-response-invalid' })
    })

    it('maps a call that hit the invoke timeout', async () => {
        vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort())
        stubRunner(() => {
            throw Object.assign(new Error('Request aborted'), { name: 'AbortError' })
        })

        const error = await invokeGate('v3', RUNNER_FUNCTION).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(SemgrepRunnerFailed)
        expect(error).toMatchObject({ code: 'runner-timeout' })
    })
})
