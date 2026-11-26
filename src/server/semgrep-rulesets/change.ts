import { z } from 'zod'
import logger from '@/lib/logger'
import { PROMOTE_CHANGE_NOTE_MAX } from '@/schema/semgrep-ruleset'
import { rulesetVersionNumber, type RulesetRequest } from '@/lib/semgrep-rulesets/schemas'
import {
    GATE_CHECKS,
    rulesetPersonSchema,
    rulesetVersionSchema,
    type GateResponse,
} from '../../../services/semgrep-runner/protocol'
import { semgrepRulesetConfig, type SemgrepRulesetConfig } from './config'
import { invokeGate, SemgrepRunnerFailed } from './runner'
import { RulesetPreconditionFailed } from './s3'
import {
    claimRequest,
    createVersion,
    finishRequest,
    readManifest,
    readPublished,
    readRequest,
    readVersionFiles,
    writePointer,
} from './store'

const base = z.object({
    requestId: z.uuid(),
    requestedBy: rulesetPersonSchema,
    requestedAt: z.iso.datetime(),
})

export const semgrepRulesetChangePayloadSchema = z.discriminatedUnion('kind', [
    base.extend({ kind: z.enum(['publish', 'rollback']), version: rulesetVersionSchema }),
    base.extend({
        kind: z.literal('promote'),
        upstreamVersion: rulesetVersionSchema,
        changeNote: z.string().max(PROMOTE_CHANGE_NOTE_MAX).optional(),
    }),
])
export type SemgrepRulesetChangePayload = z.infer<typeof semgrepRulesetChangePayloadSchema>

type Ending = { status: Exclude<RulesetRequest['status'], 'running'>; reason: string | null }
// What the request reached before it ended, so an error still records the version and gate result.
type Progress = { targetVersion: string | null; gate: GateResponse | null }
type Published = Awaited<ReturnType<typeof readPublished>>

const ending = (status: Ending['status'], reason: string | null = null): Ending => ({ status, reason })

const isNewer = (a: string, b: string) => rulesetVersionNumber(a) > rulesetVersionNumber(b)

async function publishOrRollbackRefusal(
    config: SemgrepRulesetConfig,
    payload: Extract<SemgrepRulesetChangePayload, { kind: 'publish' | 'rollback' }>,
    current: Published,
): Promise<Ending | null> {
    const published = current?.pointer.version
    if (payload.kind === 'rollback' && !published) return ending('invalid', 'nothing is published')
    if (!(await readManifest(config.env, payload.version))) return ending('invalid', 'unknown version')
    if (published === payload.version) return ending('invalid', 'already published')
    if (payload.kind === 'publish' && published && isNewer(published, payload.version)) {
        return ending('invalid', 'not newer than the published version')
    }
    if (payload.kind === 'rollback' && published && isNewer(payload.version, published)) {
        return ending('invalid', 'not older than the published version')
    }
    return null
}

// Copies the upstream environment's published version into a new local version, which the gate then checks.
async function promote(
    config: SemgrepRulesetConfig,
    payload: Extract<SemgrepRulesetChangePayload, { kind: 'promote' }>,
): Promise<Ending | string> {
    if (!config.upstreamEnv) return ending('invalid', `no upstream for ${config.env}`)
    const upstream = await readPublished(config.upstreamEnv)
    if (!upstream) return ending('invalid', 'upstream has no published version')
    if (upstream.pointer.version !== payload.upstreamVersion) {
        return ending('conflict', 'upstream published version changed')
    }
    const manifest = await readManifest(config.upstreamEnv, payload.upstreamVersion)
    if (!manifest) return ending('invalid', 'unknown upstream version')
    const prefix = `Promoted from ${config.upstreamEnv} ${payload.upstreamVersion}`
    const created = await createVersion({
        env: config.env,
        files: await readVersionFiles(config.upstreamEnv, manifest),
        changeNote: payload.changeNote ? `${prefix}: ${payload.changeNote}` : prefix,
        author: payload.requestedBy,
        source: { env: config.upstreamEnv, version: payload.upstreamVersion },
    })
    return created.version
}

// A runner error or a response that does not answer this request is not a verdict on the rules.
function gateEnding(target: string, gate: GateResponse): Ending | null {
    if (gate.error) return ending('error', gate.error)
    const names = gate.checks.map((check) => check.name)
    const complete = names.length === GATE_CHECKS.length && GATE_CHECKS.every((name) => names.includes(name))
    const allPassed = gate.checks.every((check) => check.passed && !check.skipped)
    if (gate.rulesetVersion !== target || !complete || gate.passed !== allPassed) {
        return ending('error', 'gate-response-mismatch')
    }
    return gate.passed ? null : ending('gate-failed')
}

async function upstreamMoved(config: SemgrepRulesetConfig, upstreamVersion: string): Promise<boolean> {
    const upstream = config.upstreamEnv ? await readPublished(config.upstreamEnv) : null
    return upstream?.pointer.version !== upstreamVersion
}

// A pointer write can land while its request record never gets the final write. The next change finds that
// record here, so the outcome is recorded without publishing again.
async function reconcileStuckRequest(config: SemgrepRulesetConfig): Promise<void> {
    const current = await readPublished(config.env)
    if (!current) return
    const stuck = await readRequest(config.env, current.pointer.requestId)
    if (stuck?.record.status !== 'running') return
    await finishRequest(
        config.env,
        { ...stuck.record, status: 'published', reason: null, finishedAt: new Date().toISOString() },
        stuck.etag,
    )
}

async function applyChange(
    config: SemgrepRulesetConfig,
    payload: SemgrepRulesetChangePayload,
    progress: Progress,
): Promise<Ending> {
    // Checked before any write, so a promotion leaves no local version behind.
    if (!config.runnerFunctionName) return ending('error', 'runner-not-configured')

    // One snapshot of the pointer: every check below and the conditional write use it.
    const current = await readPublished(config.env)
    if (payload.kind === 'promote') {
        const promoted = await promote(config, payload)
        if (typeof promoted !== 'string') return promoted
        progress.targetVersion = promoted
    } else {
        const refusal = await publishOrRollbackRefusal(config, payload, current)
        if (refusal) return refusal
    }
    const target = progress.targetVersion!

    progress.gate = await invokeGate(target, config.runnerFunctionName)
    const verdict = gateEnding(target, progress.gate)
    if (verdict) return verdict

    // Not atomic with the pointer write below: an upstream move in that gap still lands.
    if (payload.kind === 'promote' && (await upstreamMoved(config, payload.upstreamVersion))) {
        return ending('conflict', 'upstream published version changed')
    }

    try {
        await writePointer(
            config.env,
            {
                schemaVersion: 1,
                version: target,
                publishedAt: new Date().toISOString(),
                publishedBy: payload.requestedBy,
                kind: payload.kind,
                previousVersion: current?.pointer.version ?? null,
                requestId: payload.requestId,
            },
            current?.etag ?? null,
        )
    } catch (error) {
        if (error instanceof RulesetPreconditionFailed) {
            return ending('conflict', 'published version changed during the request')
        }
        throw error
    }
    return ending('published')
}

// No message text or stack: the request record is readable by every SI admin and outlives the logs.
const errorReason = (error: unknown) => {
    if (error instanceof SemgrepRunnerFailed) return error.code
    return error instanceof Error && error.name !== 'Error' ? error.name : 'unexpected'
}

/**
 * Publishes, rolls back or promotes a ruleset version in the JobWorker. The pointer moves only after
 * the runner gate passed, with a conditional write. The request record holds the outcome.
 */
export async function runRulesetChange(payload: SemgrepRulesetChangePayload): Promise<void> {
    const config = semgrepRulesetConfig()
    const progress: Progress = { targetVersion: payload.kind === 'promote' ? null : payload.version, gate: null }
    const record: RulesetRequest = {
        requestId: payload.requestId,
        kind: payload.kind,
        targetVersion: progress.targetVersion,
        upstreamVersion: payload.kind === 'promote' ? payload.upstreamVersion : null,
        requestedBy: payload.requestedBy,
        requestedAt: payload.requestedAt,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: 'running',
        reason: null,
        gate: null,
    }

    try {
        await reconcileStuckRequest(config)
    } catch (error) {
        logger.error(error)
    }

    let etag: string
    try {
        etag = await claimRequest(config.env, record)
    } catch (error) {
        // Lambda can deliver a message twice; the first delivery owns the request.
        if (error instanceof RulesetPreconditionFailed) {
            logger.info(`Semgrep ruleset request ${payload.requestId} is already claimed`)
            return
        }
        throw error
    }

    const finish = (end: Ending) =>
        finishRequest(config.env, { ...record, ...progress, ...end, finishedAt: new Date().toISOString() }, etag)

    let end: Ending
    try {
        end = await applyChange(config, payload, progress)
    } catch (error) {
        await finish(ending('error', errorReason(error))).catch((finishError: unknown) => logger.error(finishError))
        throw error
    }
    await finish(end)
}
