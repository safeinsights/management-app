import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import * as RouterMock from 'next-router-mock'

export const mockPathname = (path: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(RouterMock as any).memoryRouter.setCurrentUrl(path)
}

export const flushDeferred = () => globalThis.__flushDeferred()

// The error Next raises when the posted action id is absent from the build now serving, which an
// open tab meets when the key rotates or the action moved, renamed or was removed. The real class
// rather than a hand-built stand-in, so a Next upgrade that renames it fails errors.test.ts instead
// of silently sending such a tab back to the framework text (OTTER-726).
export const staleActionError = () =>
    new UnrecognizedActionError('Server Action "7f60224d81" was not found on the server.')
