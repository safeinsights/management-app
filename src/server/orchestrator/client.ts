import { getConfigValue } from '@/server/config'

export class OrchestratorError extends Error {
    constructor(
        public status: number,
        public retryAfterSec: number | null,
        message: string,
    ) {
        super(message)
        this.name = 'OrchestratorError'
    }
}

export interface CreateSessionRequest {
    user_id: string
    study_id: string
    user_email: string
}

export interface CreateSessionResponse {
    session_id: string
    session_url: string
    session_token: string
    expires_at: string
    pod_name: string
    status: string
}

const REQUEST_TIMEOUT_MS = 10_000

export async function createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
    const url = await getConfigValue('ORCHESTRATOR_URL', true)
    const token = await getConfigValue('ORCHESTRATOR_SERVICE_TOKEN', true)

    if (!url || !token) {
        throw new OrchestratorError(500, null, 'orchestrator config missing')
    }

    const res = await fetch(`${url}/internal/sessions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Orchestrator-Auth': token,
            Accept: 'application/json',
        },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (res.status === 503) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10)
        throw new OrchestratorError(503, Number.isFinite(retryAfter) ? retryAfter : 5, 'orchestrator: warm pool empty')
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new OrchestratorError(res.status, null, `orchestrator ${res.status}: ${body.slice(0, 200)}`)
    }

    return (await res.json()) as CreateSessionResponse
}
