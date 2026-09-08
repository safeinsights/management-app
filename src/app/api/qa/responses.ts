import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { QaCleanupNotFoundError, QaForbiddenError } from '@/server/qa-cleanup'
import { QaConflictError, QaInvalidRequestError } from '@/server/qa-provision'

// Anything unmapped rethrows so a genuine fault surfaces as a 500 rather than a misleading 4xx.
export function qaErrorResponse(error: unknown): NextResponse {
    if (error instanceof QaCleanupNotFoundError) {
        return NextResponse.json({ error: error.message }, { status: 404 })
    }
    // These routes run on production; this is the guard that keeps them off real data.
    if (error instanceof QaForbiddenError) {
        return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof QaConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof QaInvalidRequestError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof ZodError) {
        return NextResponse.json({ error: 'invalid request body', details: error.issues }, { status: 400 })
    }
    if (error instanceof SyntaxError) {
        return NextResponse.json({ error: 'request body is not valid JSON' }, { status: 400 })
    }
    throw error
}
