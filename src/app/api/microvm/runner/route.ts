import { z } from 'zod'
import { NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { ensureRunner } from '@/server/microvm/runner'
import { verifySyncToken } from '@/server/microvm/workspaces'
import { currentDb } from '@/server/request-context'

// Asked by a research IDE MicroVM for the way to its study's runner: the second MicroVM, built
// from the code environment's image, where the study's code runs. The bearer token is the one the
// IDE was launched with, which is how the IDE proves its study; it names nothing else.
const schema = z.object({ studyId: z.string().uuid() })

export async function POST(req: Request) {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
    if (!token) return new NextResponse('Unauthorized', { status: 401 })

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) return new NextResponse('Bad request', { status: 400 })

    if (!(await verifySyncToken(parsed.data.studyId, token))) {
        logger.warn(`[microvm-runner study=${parsed.data.studyId}] rejected a request with an unknown token`)
        return new NextResponse('Unauthorized', { status: 401 })
    }

    const answer = await ensureRunner(parsed.data.studyId, currentDb())
    return NextResponse.json(answer, {
        status: answer.ready ? 200 : 409,
        headers: { 'cache-control': 'no-store' },
    })
}
