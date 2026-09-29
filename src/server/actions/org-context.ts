import type { OrgType } from '@/database/types'
import { ActionFailure } from '@/lib/errors'

type OrgCtx = { orgId?: string; orgType?: OrgType }

// An unknown slug leaves both fields undefined while typed as set, and ('manage','all') passes the
// $in rule, so an SI admin would otherwise reach the handler with an undefined orgId.
export function requireResolvedOrg(ctx: OrgCtx): asserts ctx is { orgId: string; orgType: OrgType } {
    if (!ctx.orgId || !ctx.orgType) throw new ActionFailure({ org: 'was not found' })
}

// Only a data partner designates test labs; a lab org reaching this has nothing to answer.
export function requireDataPartner(ctx: OrgCtx): asserts ctx is { orgId: string; orgType: 'enclave' } {
    requireResolvedOrg(ctx)
    if (ctx.orgType !== 'enclave') throw new ActionFailure({ org: 'is not a data partner' })
}
