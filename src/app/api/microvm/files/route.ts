import { z } from 'zod'
import { NextResponse } from 'next/server'
import { applyMicrovmFileSync } from '@/server/microvm/workspaces'
import logger from '@/lib/logger'

// Pushed by a research IDE MicroVM as the researcher edits, standing in for the shared EFS home
// directory Coder workspaces have. The bearer token is the one the MicroVM was launched with.
const schema = z.object({
    studyId: z.string().uuid(),
    files: z.array(z.object({ path: z.string(), content: z.string(), mtime: z.number() })),
    deleted: z.array(z.string()),
})

export async function POST(req: Request) {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
    if (!token) return new NextResponse('Unauthorized', { status: 401 })

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) return new NextResponse('Bad request', { status: 400 })

    if (!(await applyMicrovmFileSync(parsed.data, token))) {
        logger.warn(`[microvm-sync study=${parsed.data.studyId}] rejected sync with an unknown token`)
        return new NextResponse('Unauthorized', { status: 401 })
    }
    return new NextResponse(null, { status: 204 })
}
