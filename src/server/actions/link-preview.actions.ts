'use server'

import { Action, z } from '@/server/actions/action'
import { toRecord } from '@/lib/permissions'
import { matchInternalRoute, type ResolvedInternalLink } from '@/lib/routes/match'
import { displayOrgName, UNTITLED_STUDY_TITLE } from '@/lib/string'

// Deleted, never there, and not allowed all answer the same way, so a preview cannot be used to
// probe for studies or orgs the caller has no access to.
const UNAVAILABLE: ResolvedInternalLink = { kind: 'unavailable' }

export const resolveInternalLinkAction = new Action('resolveInternalLinkAction')
    .params(z.object({ pathname: z.string().max(2048) }))
    .handler(async ({ params, db, session }): Promise<ResolvedInternalLink> => {
        if (!session) return UNAVAILABLE

        const match = matchInternalRoute(params.pathname)
        if (!match) return { kind: 'unknown' }

        if (match.kind === 'appPage') {
            return { kind: 'internal', title: match.title, category: match.category }
        }

        const org = await db
            .selectFrom('org')
            .select(['org.id', 'org.name'])
            .where('org.slug', '=', match.orgSlug)
            .executeTakeFirst()
        if (!org) return UNAVAILABLE

        const category = displayOrgName(org.name)

        if (match.kind === 'orgPage') {
            const isMember = session.user.isSiAdmin || Boolean(session.orgs[match.orgSlug])
            return isMember ? { kind: 'internal', title: match.title, category } : UNAVAILABLE
        }

        const study = await db
            .selectFrom('study')
            .select(['study.title', 'study.orgId', 'study.submittedByOrgId', 'study.status'])
            .where('study.id', '=', match.studyId)
            .where('study.deletedAt', 'is', null)
            .executeTakeFirst()
        if (!study) return UNAVAILABLE

        // The org in the URL has to be one of the study's two sides, or the link is not a link to
        // this study as this org sees it.
        if (org.id !== study.orgId && org.id !== study.submittedByOrgId) return UNAVAILABLE

        const canView = session.can(
            'view',
            toRecord('Study', {
                orgId: study.orgId,
                submittedByOrgId: study.submittedByOrgId,
                status: study.status,
            }),
        )
        if (!canView) return UNAVAILABLE

        return { kind: 'internal', title: study.title ?? UNTITLED_STUDY_TITLE, category }
    })
