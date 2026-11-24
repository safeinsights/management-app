'use server'

import {
    createSemgrepRulesetDraftSchema,
    requestSemgrepRulesetChangeSchema,
    runSemgrepRulesTestSchema,
    semgrepRulesetRequestSchema,
    semgrepRulesetVersionSchema,
} from '@/schema/semgrep-ruleset'
import { buildTestRequest } from '@/lib/semgrep-rulesets/test-run'
import { fetchUserFullName } from '@/server/db/queries'
import { onSemgrepRulesetChangeRequested } from '@/server/events'
import { isJobQueueConfigured } from '@/server/jobs/queue'
import { RulesetStoreNotConfigured, semgrepRulesetConfig } from '@/server/semgrep-rulesets/config'
import { invokeTest, SemgrepRunnerFailed } from '@/server/semgrep-rulesets/runner'
import {
    createVersion,
    listManifests,
    readManifest,
    readPublished,
    readRequest,
    readVersionFiles,
} from '@/server/semgrep-rulesets/store'
import type { DBExecutor } from '@/database'
import type { RulesetEnv } from '../../../services/semgrep-runner/protocol'
import { Action, ActionFailure } from './action'

function storeConfig() {
    try {
        return semgrepRulesetConfig()
    } catch (error) {
        if (error instanceof RulesetStoreNotConfigured) {
            throw new ActionFailure({ semgrepRuleset: 'is not configured in this environment' })
        }
        throw error
    }
}

// The generated full name can be empty, and a version needs a name for its author.
async function rulesetPerson(userId: string, db: DBExecutor) {
    return { userId, name: (await fetchUserFullName(userId, db)) || userId }
}

async function readVersion(env: RulesetEnv, version: string) {
    const manifest = await readManifest(env, version)
    if (!manifest) return null
    return { manifest, files: await readVersionFiles(env, manifest) }
}

export const listSemgrepRulesetVersionsAction = new Action('listSemgrepRulesetVersionsAction')
    .requireAbilityTo('view', 'SemgrepRuleset')
    .handler(async () => {
        const { env, upstreamEnv, runnerFunctionName } = storeConfig()
        const [manifests, published] = await Promise.all([listManifests(env), readPublished(env)])
        return {
            env,
            upstreamEnv,
            canRunTests: runnerFunctionName !== null,
            published: published?.pointer ?? null,
            versions: manifests,
        }
    })

export const getSemgrepRulesetVersionAction = new Action('getSemgrepRulesetVersionAction')
    .params(semgrepRulesetVersionSchema)
    .requireAbilityTo('view', 'SemgrepRuleset')
    .handler(async ({ params: { version } }) => {
        const found = await readVersion(storeConfig().env, version)
        if (!found) throw new ActionFailure({ version: 'does not exist' })
        return found
    })

// The upstream environment's published version, which a promote would copy.
export const getUpstreamSemgrepRulesetAction = new Action('getUpstreamSemgrepRulesetAction')
    .requireAbilityTo('view', 'SemgrepRuleset')
    .handler(async () => {
        const { upstreamEnv } = storeConfig()
        if (!upstreamEnv) return null
        const published = await readPublished(upstreamEnv)
        if (!published) return null
        const found = await readVersion(upstreamEnv, published.pointer.version)
        return found && { env: upstreamEnv, pointer: published.pointer, ...found }
    })

export const getSemgrepRulesetRequestAction = new Action('getSemgrepRulesetRequestAction')
    .params(semgrepRulesetRequestSchema)
    .requireAbilityTo('view', 'SemgrepRuleset')
    .handler(async ({ params: { requestId } }) => {
        // The job writes the record when it starts, so a request still in the queue has none yet.
        return (await readRequest(storeConfig().env, requestId))?.record ?? null
    })

// Runs unsaved rules, so it needs update rather than view: test files can hold any code.
export const runSemgrepRulesTestAction = new Action('runSemgrepRulesTestAction')
    .params(runSemgrepRulesTestSchema)
    .requireAbilityTo('update', 'SemgrepRuleset')
    .handler(async ({ params: { files, scratchFiles } }) => {
        const { runnerFunctionName } = storeConfig()
        if (!runnerFunctionName) throw new ActionFailure({ semgrepRuleset: 'cannot run tests in this environment' })
        try {
            return await invokeTest(buildTestRequest(files, scratchFiles), runnerFunctionName)
        } catch (error) {
            if (error instanceof SemgrepRunnerFailed) {
                throw new ActionFailure({ semgrepRuleset: `test run failed (${error.code})` })
            }
            throw error
        }
    })

export const createSemgrepRulesetDraftAction = new Action('createSemgrepRulesetDraftAction')
    .params(createSemgrepRulesetDraftSchema)
    .requireAbilityTo('update', 'SemgrepRuleset')
    .handler(async ({ db, session, params: { files, changeNote } }) => {
        const config = storeConfig()
        const manifest = await createVersion({
            env: config.env,
            files,
            changeNote,
            author: await rulesetPerson(session.user.id, db),
            source: null,
        })
        return { version: manifest.version }
    })

// The app Lambda times out after 30 s, so the gate and the pointer move run in the JobWorker. The job
// checks the versions against one read of the pointer, so this action does not.
export const requestSemgrepRulesetChangeAction = new Action('requestSemgrepRulesetChangeAction')
    .params(requestSemgrepRulesetChangeSchema)
    .requireAbilityTo('publish', 'SemgrepRuleset')
    .handler(async ({ db, session, params }) => {
        const config = storeConfig()
        // Local dev and PR previews have no job queue, and a gate cannot run in the request.
        if (!isJobQueueConfigured() || !config.runnerFunctionName) {
            throw new ActionFailure({ semgrepRuleset: 'cannot be published in this environment' })
        }
        const requestId = crypto.randomUUID()
        await onSemgrepRulesetChangeRequested({
            ...params,
            requestId,
            requestedBy: await rulesetPerson(session.user.id, db),
            requestedAt: new Date().toISOString(),
        })
        return { requestId }
    })
