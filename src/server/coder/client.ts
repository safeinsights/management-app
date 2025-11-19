import { getConfigValue } from '../config'

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

    const response = await fetch(`${coderApiEndpoint}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    })

    console.log('RESPONSE: ', response)
    console.log('PATH: ', path)
    if (!response.ok) {
        const errorText = await response.text()
        throw new CoderApiError(`${errorMessage}: ${response.status} ${errorText}`, response.status, errorText)
    }

    return (await response.json()) as T
}
