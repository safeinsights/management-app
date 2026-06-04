import { getConfigValue } from '../config'
import logger from '@/lib/logger'

// Coder API calls had no timeout: a hung request leaves the launch poll
// pending forever, which surfaces as an endless UI spinner with no error.
// Bound it so a stall becomes a logged, throwable failure instead.
const CODER_FETCH_TIMEOUT_MS = 15_000

export interface CoderFetchOptions {
    method?: RequestInit['method']
    body?: BodyInit | object
    errorMessage?: string
}

export class CoderApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public responseText: string,
    ) {
        super(message)
        this.name = 'CoderApiError'
    }
}

export async function coderFetch<T>(path: string, options: CoderFetchOptions = {}): Promise<T> {
    const { method = 'GET', body, errorMessage = 'Coder API request failed' } = options

    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')

    const headers: Record<string, string> = {
        Accept: 'application/json',
        'Coder-Session-Token': coderToken,
    }

    if (body) {
        headers['Content-Type'] = 'application/json'
    }

    let response: Response
    try {
        response = await fetch(`${coderApiEndpoint}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(CODER_FETCH_TIMEOUT_MS),
        })
    } catch (error) {
        const timedOut = error instanceof Error && error.name === 'TimeoutError'
        logger.error(
            `Coder API ${method} ${path} ${timedOut ? `timed out after ${CODER_FETCH_TIMEOUT_MS}ms` : 'request failed'}:`,
            error,
        )
        throw error
    }

    if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Coder API ${method} ${path} -> ${response.status}: ${errorText}`)
        throw new CoderApiError(`${errorMessage}: ${response.status} ${errorText}`, response.status, errorText)
    }

    return (await response.json()) as T
}
