import type { Kysely } from 'kysely'
import type { DB } from '@/database/types'
import { ORGS, TEST_USERS } from '../seeds/1743608138837_test_users'

const userId = (key: string) => TEST_USERS.find((user) => user.key === key)!.id
const org = (slug: string) => ORGS.find((o) => o.slug === slug)!

export const DEFAULT_REF_IDS = {
    researcherId: userId('researcher'),
    reviewerId: userId('reviewer'),
    adminId: userId('admin'),
    enclaveId: org('openstax').id,
    labId: org('openstax-lab').id,
}

export type RefIds = typeof DEFAULT_REF_IDS

export type SampleRefs = {
    researcherId: string
    reviewerId: string
    adminId: string
    enclave: { id: string; slug: string }
    lab: { id: string; slug: string }
}

// The QA org that exists in every environment, production included (OTTER-941). Found by slug
// and email, not id: those orgs and accounts were made by hand, so their ids differ per env.
export const SAMPLE_TARGET = {
    enclaveSlug: 'mars-u',
    labSlug: 'mars-u-lab',
    researcherEmail: 'qa-review+researcher@safeinsights.org',
    reviewerEmail: 'qa-review+dp@safeinsights.org',
    adminEmail: 'qa-review+admin@safeinsights.org',
}

export type SampleTarget = typeof SAMPLE_TARGET

export async function resolveTargetRefs(
    db: Kysely<DB>,
    target: SampleTarget = SAMPLE_TARGET,
): Promise<{ refs: SampleRefs } | { missing: string[] }> {
    const emails = [target.researcherEmail, target.reviewerEmail, target.adminEmail]
    const [users, orgs] = await Promise.all([
        db.selectFrom('user').select(['id', 'email']).where('email', 'in', emails).execute(),
        db.selectFrom('org').select(['id', 'slug']).where('slug', 'in', [target.enclaveSlug, target.labSlug]).execute(),
    ])
    const userId = (email: string) => users.find((u) => u.email === email)?.id
    const org = (slug: string) => orgs.find((o) => o.slug === slug)
    const missing = [
        ...emails.filter((e) => !userId(e)),
        ...[target.enclaveSlug, target.labSlug].filter((s) => !org(s)),
    ]
    if (missing.length) return { missing }

    return {
        refs: {
            researcherId: userId(target.researcherEmail)!,
            reviewerId: userId(target.reviewerEmail)!,
            adminId: userId(target.adminEmail)!,
            enclave: org(target.enclaveSlug)!,
            lab: org(target.labSlug)!,
        },
    }
}

// Fixed ids only: a long-lived environment whose test users predate the fixed ids gets no sample data.
export async function resolveRefs(
    db: Kysely<DB>,
    ids: RefIds = DEFAULT_REF_IDS,
): Promise<{ refs: SampleRefs } | { missing: string[] }> {
    const [users, orgs] = await Promise.all([
        db.selectFrom('user').select('id').where('id', 'in', [ids.researcherId, ids.reviewerId, ids.adminId]).execute(),
        db.selectFrom('org').select(['id', 'slug']).where('id', 'in', [ids.enclaveId, ids.labId]).execute(),
    ])
    const found = new Set([...users, ...orgs].map((row) => row.id))
    const missing = Object.values(ids).filter((id) => !found.has(id))
    if (missing.length) return { missing }

    const slugOf = (id: string) => orgs.find((o) => o.id === id)!.slug
    return {
        refs: {
            researcherId: ids.researcherId,
            reviewerId: ids.reviewerId,
            adminId: ids.adminId,
            enclave: { id: ids.enclaveId, slug: slugOf(ids.enclaveId) },
            lab: { id: ids.labId, slug: slugOf(ids.labId) },
        },
    }
}
