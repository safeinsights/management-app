import { randomBytes } from 'crypto'
import { INVITE_EMAIL_TIMEOUT } from './config'

// A tiny client for the free mail.tm disposable-inbox API, for the one test that needs a real
// email to arrive (the invitation). Ported from qa-review/src/engine/mailtm.ts. Each test creates
// its own inbox: mail.tm refuses '+' in addresses, so one inbox cannot be plus-addressed.

const API = 'https://api.mail.tm'
const RETRY_BACKOFFS_MS = [500, 1500, 3000, 5000]
const POLL_MS = 2_000
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Unbiased: a byte is only used when it falls inside the largest whole multiple of the alphabet.
export function randomToken(length: number): string {
    const limit = 256 - (256 % ALPHABET.length)
    let out = ''
    while (out.length < length) {
        for (const byte of randomBytes((length - out.length) * 2)) {
            if (byte < limit) {
                out += ALPHABET[byte % ALPHABET.length]
                if (out.length === length) break
            }
        }
    }
    return out
}

export type Inbox = { id: string; address: string; token: string }
export type Message = { id: string; subject: string; from: string; text: string; html: string }

// The free tier answers bursts with 429 (and sometimes 503); both are transient.
async function api(path: string, init?: RequestInit): Promise<Response> {
    let response = await fetch(`${API}${path}`, init)
    for (let attempt = 0; attempt < RETRY_BACKOFFS_MS.length && [429, 503].includes(response.status); attempt++) {
        await sleep(RETRY_BACKOFFS_MS[attempt])
        response = await fetch(`${API}${path}`, init)
    }
    return response
}

export async function activeDomain(): Promise<string> {
    const response = await api('/domains')
    if (!response.ok) throw new Error(`mail.tm GET /domains failed: ${response.status}`)
    const body = (await response.json()) as { 'hydra:member'?: { domain: string; isActive: boolean }[] }
    const domains = body['hydra:member'] ?? []
    const active = domains.find((domain) => domain.isActive) ?? domains[0]
    if (!active) throw new Error('mail.tm returned no domains')
    return active.domain
}

// The local part starts with "qa-": the app's QA routes, which delete the account afterwards,
// refuse any address that does not.
export async function createInbox(domain: string): Promise<Inbox> {
    const address = `qa-e2e-${randomToken(10)}@${domain}`
    const password = `E2e-${randomToken(12)}-9!`
    const created = await api('/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password }),
    })
    if (!created.ok) throw new Error(`mail.tm POST /accounts failed: ${created.status}`)
    const account = (await created.json()) as { id: string; address: string }
    const tokenResponse = await api('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password }),
    })
    if (!tokenResponse.ok) throw new Error(`mail.tm POST /token failed: ${tokenResponse.status}`)
    const { token } = (await tokenResponse.json()) as { token: string }
    return { id: account.id, address: account.address, token }
}

async function listMessages(inbox: Inbox): Promise<{ id: string }[]> {
    const response = await api('/messages', { headers: { Authorization: `Bearer ${inbox.token}` } })
    if (!response.ok) throw new Error(`mail.tm GET /messages failed: ${response.status}`)
    return ((await response.json()) as { 'hydra:member'?: { id: string }[] })['hydra:member'] ?? []
}

async function getMessage(inbox: Inbox, id: string): Promise<Message> {
    const response = await api(`/messages/${id}`, { headers: { Authorization: `Bearer ${inbox.token}` } })
    if (!response.ok) throw new Error(`mail.tm GET /messages/${id} failed: ${response.status}`)
    const raw = (await response.json()) as {
        id: string
        subject: string
        from: { address: string }
        text?: string
        html?: string[]
    }
    return {
        id: raw.id,
        subject: raw.subject,
        from: raw.from.address,
        text: raw.text ?? '',
        html: (raw.html ?? []).join('\n'),
    }
}

// Polls the inbox until a message satisfies `predicate`, within the invite email budget.
export async function waitForMessage(inbox: Inbox, predicate: (message: Message) => boolean): Promise<Message> {
    const deadline = Date.now() + INVITE_EMAIL_TIMEOUT
    const seen = new Set<string>()
    while (Date.now() < deadline) {
        try {
            for (const summary of await listMessages(inbox)) {
                if (seen.has(summary.id)) continue
                seen.add(summary.id)
                const message = await getMessage(inbox, summary.id)
                if (predicate(message)) return message
            }
        } catch {
            // transient: keep polling until the deadline
        }
        await sleep(Math.min(POLL_MS, Math.max(deadline - Date.now(), 0)))
    }
    throw new Error(`mail.tm: no matching message for ${inbox.address} within ${INVITE_EMAIL_TIMEOUT / 1000}s`)
}

// The invitation link out of the email: HTML hrefs encode `&`, and the footer links are not it.
export function extractSignupUrl(message: Message): string {
    const entities: Record<string, string> = { '&amp;': '&', '&#38;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' }
    const text = `${message.text}\n${message.html}`.replace(/&(?:amp|#38|lt|gt|quot);/g, (entity) => entities[entity])
    const urls = (text.match(/https?:\/\/[^\s"'<>)]+/g) ?? []).map((url) => url.replace(/[.,;:!?)\]}]+$/, ''))
    const signup = urls.find((url) => url.includes('/account/invitation/'))
    if (!signup) throw new Error(`no invitation url found in message ${message.id}`)
    return signup
}

export async function deleteInbox(inbox: Inbox): Promise<void> {
    await api(`/accounts/${inbox.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${inbox.token}` } }).catch(
        () => {},
    )
}
