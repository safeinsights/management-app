import { NextResponse } from 'next/server'
import { errorToString, isActionError } from '@/lib/errors'
import { ensureWorkspaceAction, getWorkspaceLaunchStatusAction } from '@/server/actions/workspaces.actions'

// The Launch IDE button opens this in a new tab during the click, so no popup blocker stands in the
// way and the study page shows no progress modal: this tab waits for the MicroVM, then becomes the
// IDE. The actions carry the same study access checks as the button's own launch path. Short of the
// Lambda's 30 s timeout.
const READY_DEADLINE_MS = 25_000
const POLL_MS = 1_000

const failurePage = (message: string) =>
    new NextResponse(
        `<!doctype html><html><head><meta charset="utf-8"><title>SafeInsights IDE</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem">
<h1 style="font-size: 1.25rem">The IDE could not start</h1>
<p>${message.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`)}</p>
<p>Reload this page to try again, or contact SafeInsights support.</p>
</body></html>`,
        { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
    )

export async function GET(_req: Request, { params }: { params: Promise<{ studyId: string }> }) {
    const { studyId } = await params

    const ensured = await ensureWorkspaceAction({ studyId })
    if (isActionError(ensured)) return failurePage(errorToString(ensured.error))

    const deadline = Date.now() + READY_DEADLINE_MS
    for (;;) {
        const status = await getWorkspaceLaunchStatusAction({ studyId })
        if (isActionError(status)) return failurePage(errorToString(status.error))
        if (status.url) return NextResponse.redirect(status.url)
        if (status.failed) return failurePage(status.reason || 'The IDE failed to start.')
        if (Date.now() > deadline) return failurePage('The IDE is still starting.')
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
}
