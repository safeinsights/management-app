import { describe, expect, it } from 'vitest'
import {
    jobErrorDetails,
    jobFailureStage,
    latestStatusMessage,
    packagingFailureMessage,
    NO_ERROR_LOG_TEXT,
} from './job-error-details'

const at = (status: Parameters<typeof latestStatusMessage>[1], createdAt: string, message?: string) => ({
    status,
    createdAt,
    message: message ?? null,
})

describe('jobFailureStage', () => {
    // JOB-READY is the containerizer reporting success, so its absence is what identifies a
    // packaging failure. This is the case OTTER-524 was reported for.
    it('reads a missing JOB-READY as a packaging failure', () => {
        const stage = jobFailureStage([
            at('CODE-APPROVED', '2026-04-21T21:15:00Z'),
            at('JOB-PACKAGING', '2026-04-21T21:15:10Z'),
            at('JOB-ERRORED', '2026-04-21T21:15:55Z'),
        ])
        expect(stage).toBe('packaging')
    })

    it('reads JOB-READY without JOB-RUNNING as never started', () => {
        const stage = jobFailureStage([
            at('JOB-PACKAGING', '2026-04-21T21:15:10Z'),
            at('JOB-READY', '2026-04-21T21:16:00Z'),
            at('JOB-PROVISIONING', '2026-04-21T21:17:00Z'),
            at('JOB-ERRORED', '2026-04-21T21:18:00Z'),
        ])
        expect(stage).toBe('never-started')
    })

    it('reads JOB-RUNNING as a failure during the run', () => {
        const stage = jobFailureStage([
            at('JOB-READY', '2026-04-21T21:16:00Z'),
            at('JOB-RUNNING', '2026-04-21T21:18:00Z'),
            at('JOB-ERRORED', '2026-04-21T21:30:00Z'),
        ])
        expect(stage).toBe('run')
    })

    // Order is not significant: statusChanges arrives desc from one query and unsorted from another.
    it('does not depend on the order of the status history', () => {
        const changes = [
            at('JOB-ERRORED', '2026-04-21T21:30:00Z'),
            at('JOB-RUNNING', '2026-04-21T21:18:00Z'),
            at('JOB-READY', '2026-04-21T21:16:00Z'),
        ]
        expect(jobFailureStage(changes)).toBe('run')
        expect(jobFailureStage([...changes].reverse())).toBe('run')
    })
})

describe('latestStatusMessage', () => {
    it('returns the message recorded against the requested status', () => {
        const changes = [at('JOB-ERRORED', '2026-04-21T21:15:55Z', 'base image: harbor/opensta/r-base:1')]
        expect(latestStatusMessage(changes, 'JOB-ERRORED')).toBe('base image: harbor/opensta/r-base:1')
    })

    it('ignores messages on other statuses', () => {
        const changes = [
            at('JOB-PACKAGING', '2026-04-21T21:15:10Z', 'starting'),
            at('JOB-ERRORED', '2026-04-21T21:15:55Z'),
        ]
        expect(latestStatusMessage(changes, 'JOB-ERRORED')).toBeNull()
    })

    // The containerizer's buildspec has a fallback path that re-posts the failure payload, so the
    // same status can legitimately arrive twice.
    it('prefers the most recent message when a status is recorded more than once', () => {
        const changes = [
            at('JOB-ERRORED', '2026-04-21T21:15:55Z', 'first'),
            at('JOB-ERRORED', '2026-04-21T21:16:55Z', 'second'),
        ]
        expect(latestStatusMessage(changes, 'JOB-ERRORED')).toBe('second')
    })

    it('treats a blank message as no message', () => {
        expect(latestStatusMessage([at('JOB-ERRORED', '2026-04-21T21:15:55Z', '   ')], 'JOB-ERRORED')).toBeNull()
    })
})

describe('jobErrorDetails', () => {
    const packagingFailure = [at('JOB-PACKAGING', '2026-04-21T21:15:10Z'), at('JOB-ERRORED', '2026-04-21T21:15:55Z')]

    it('explains the stage even when nothing else is known', () => {
        const details = jobErrorDetails(packagingFailure, { hasErrorLog: false })

        expect(details.explanation).toContain('could not be prepared')
        expect(details.detail).toBeNull()
        expect(details.hasErrorLog).toBe(false)
    })

    it('passes the recorded reason through as secondary detail', () => {
        const changes = [
            at('JOB-PACKAGING', '2026-04-21T21:15:10Z'),
            at('JOB-ERRORED', '2026-04-21T21:15:55Z', 'base image: harbor/opensta/r-base:1'),
        ]
        const details = jobErrorDetails(changes, { hasErrorLog: false })

        expect(details.detail).toBe('base image: harbor/opensta/r-base:1')
        // The reason must not become the headline; the derived explanation still leads.
        expect(details.explanation).toContain('could not be prepared')
    })

    it('reports a run-stage failure differently from a packaging failure', () => {
        const ran = jobErrorDetails(
            [at('JOB-RUNNING', '2026-04-21T21:18:00Z'), at('JOB-ERRORED', '2026-04-21T21:30:00Z')],
            {
                hasErrorLog: true,
            },
        )
        expect(ran.explanation).not.toBe(jobErrorDetails(packagingFailure, { hasErrorLog: true }).explanation)
    })
})

describe('packagingFailureMessage', () => {
    // Names the image only. The build can fail at source sync, registry auth, resolving this image,
    // or pushing the result, and this text is fixed before we know which, so asserting a cause here
    // would misattribute three failures out of four.
    it('states the image without claiming it caused the failure', () => {
        const message = packagingFailureMessage('harbor.safeinsights.org/opensta/r-base:4.5.1')

        expect(message).toContain('harbor.safeinsights.org/opensta/r-base:4.5.1')
        expect(message).not.toMatch(/could not|failed|error|invalid/i)
    })
})

describe('copy', () => {
    it('states plainly that no log exists', () => {
        expect(NO_ERROR_LOG_TEXT).toContain('no error log')
    })
})
