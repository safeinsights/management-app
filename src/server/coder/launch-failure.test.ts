import { describe, expect, it } from '@/tests/unit.helpers'
import { describeLaunchFailure } from './launch-failure'

const TEMPLATE_SCHEME_ERROR =
    'Container image must be a plain image reference with no URL scheme (http:// or https://) or spaces, e.g. harbor.safeinsights.org/<project>/<image>:<tag> or <image>@sha256:<digest>.'

describe('describeLaunchFailure', () => {
    it.each([null, undefined, '', '   '])('returns null for %j', (raw) => {
        expect(describeLaunchFailure(raw)).toBeNull()
    })

    it('names an invalid image reference from the template validation', () => {
        const raw = `{"message":"Unable to validate parameter \\"container_image\\"","detail":"${TEMPLATE_SCHEME_ERROR}"}`
        expect(describeLaunchFailure(raw)).toMatch(/image reference is invalid/)
    })

    it('reads the message, detail and validations of a Coder JSON error body', () => {
        const raw = JSON.stringify({
            message: 'Workspace build failed',
            detail: 'exit status 1',
            validations: [{ field: 'container_image', detail: TEMPLATE_SCHEME_ERROR }],
        })
        expect(describeLaunchFailure(raw)).toMatch(/image reference is invalid/)
        expect(describeLaunchFailure(JSON.stringify({ message: 'Quota exceeded', detail: 'limit 3' }))).toBe(
            'Quota exceeded: limit 3',
        )
    })

    it('names a refused image pull', () => {
        const raw =
            'terraform apply: CannotPullContainerError: pull image manifest has been retried 5 time(s): failed to resolve ref harbor.safeinsights.org/org/image:1.0: not found'
        expect(describeLaunchFailure(raw)).toMatch(/image could not be downloaded/)
    })

    it('names any other template validation error', () => {
        expect(describeLaunchFailure('Unable to validate parameter "environment": must be JSON')).toMatch(
            /template rejected/,
        )
    })

    it('explains an agent that never became ready', () => {
        expect(
            describeLaunchFailure('build status=failed, agent not ready: lifecycle=start_error status=∅ code-server=∅'),
        ).toMatch(/IDE never became ready/)
    })

    it('falls back to the first line with internal identifiers stripped and the length capped', () => {
        const raw = `exit status 1 for task 0195a3b4-9c1d-7e2f-8a3b-4c5d6e7f8a9b in arn:aws:ecs:us-east-1:123456789012:cluster/x\nsecond line\n${'x'.repeat(500)}`
        expect(describeLaunchFailure(raw)).toBe('exit status 1 for task … in …')
        expect(describeLaunchFailure('y'.repeat(500))?.length).toBeLessThanOrEqual(200)
    })
})
