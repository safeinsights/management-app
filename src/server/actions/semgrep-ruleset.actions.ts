'use server'

import { createSemgrepRulesetDraftSchema, requestSemgrepRulesetChangeSchema } from '@/schema/semgrep-ruleset'
import { fetchUserFullName } from '@/server/db/queries'
import { onSemgrepRulesetChangeRequested } from '@/server/events'
import { isJobQueueConfigured } from '@/server/jobs/queue'
import { RulesetStoreNotConfigured, semgrepRulesetConfig } from '@/server/semgrep-rulesets/config'
import { createVersion } from '@/server/semgrep-rulesets/store'
import type { DBExecutor } from '@/database'
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
