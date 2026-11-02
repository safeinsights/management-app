import { onTestFinished, vi } from 'vitest'
import {
    createUserAndWorkspace,
    getCoderWorkspaceLaunchStatus,
    type CoderWorkspace,
    type WorkspaceLaunchStatus,
} from '@/server/coder'

// Turns Coder on for the rest of the test, against the network calls
// tests/vitest.setup.ts mocks: the workspace is created and every launch status poll answers `status`.
export const stubCoder = (status: WorkspaceLaunchStatus) => {
    vi.stubEnv('UNIT_CODER_STUBBED', 't')
    onTestFinished(() => {
        vi.unstubAllEnvs()
    })
    vi.mocked(createUserAndWorkspace).mockResolvedValue({
        success: true,
        workspace: { id: 'ws-test' } as CoderWorkspace,
    })
    vi.mocked(getCoderWorkspaceLaunchStatus).mockResolvedValue(status)
}
