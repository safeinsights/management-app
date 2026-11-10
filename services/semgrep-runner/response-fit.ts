import type { RunnerResponse, ScanResponse, TestResponse } from './protocol.ts'

// A synchronous Lambda response is limited to 6 MB.
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

export const responseBytes = (response: RunnerResponse) => Buffer.byteLength(JSON.stringify(response))

const fits = (response: RunnerResponse) => responseBytes(response) <= MAX_RESPONSE_BYTES

// The longest leading part of a list that lets the response fit; none when even an empty list does not.
function keepLeading<T, R extends RunnerResponse>(items: T[], build: (kept: T[]) => R): R {
    let fitting = 0
    let tooLarge = items.length
    while (tooLarge - fitting > 1) {
        const middle = Math.floor((fitting + tooLarge) / 2)
        if (fits(build(items.slice(0, middle)))) fitting = middle
        else tooLarge = middle
    }
    return build(items.slice(0, fitting))
}

// The status line stays: the management app reads the outcome from it.
function truncateLog<R extends RunnerResponse>(response: R): R {
    const [status, ...rest] = response.log.split('\n')
    return keepLeading(rest, (kept) => ({
        ...response,
        log: [status, ...kept, '(log truncated to fit the response limit)'].join('\n'),
        logTruncated: true,
    }))
}

// Each step leaves out more until the response fits; the status line alone always does.
function fitResponse<R extends RunnerResponse>(response: R, steps: ((response: R) => R)[]): R {
    let fitted = response
    for (const step of steps) {
        if (fits(fitted)) return fitted
        fitted = step(fitted)
    }
    return fitted
}

// The outcome and log are computed from the full report before anything is left out.
export function fitScanResponse(response: ScanResponse): ScanResponse {
    return fitResponse(response, [(r) => ({ ...r, semgrepJson: null, semgrepJsonOmitted: 'too-large' }), truncateLog])
}

// The fixture test results go last: nothing else in the response repeats them.
function shortenLogOrDropTests(response: TestResponse): TestResponse {
    const shorterLog = truncateLog(response)
    if (fits(shorterLog)) return shorterLog
    const withoutTests: TestResponse = { ...response, tests: null, testsError: 'too-large' }
    return fits(withoutTests) ? withoutTests : truncateLog(withoutTests)
}

export function fitTestResponse(response: TestResponse): TestResponse {
    return fitResponse(response, [
        (r) =>
            keepLeading(r.findings, (kept) => ({
                ...r,
                findings: kept,
                findingsOmitted: r.findings.length - kept.length,
            })),
        (r) => keepLeading(r.errors, (kept) => ({ ...r, errors: kept, errorsOmitted: r.errors.length - kept.length })),
        shortenLogOrDropTests,
    ])
}
