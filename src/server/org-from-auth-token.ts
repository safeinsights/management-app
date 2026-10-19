import { headers } from 'next/headers'

import jwt from 'jsonwebtoken'
import { isEnclaveOrg } from '@/lib/types'
import { Org } from '@/schema/org'
import { currentDb } from '@/server/request-context'

export const orgFromAuthToken = async (): Promise<Org> => {
    const authHeader = (await headers()).get('Authorization') || ''

    if (!authHeader.startsWith('Bearer ')) {
        throw new Error(`'Authorization' header missing or not well formed.`)
    }

    const token = authHeader.replace('Bearer ', '')

    const values = jwt.decode(token, { json: true })

    const orgSlug = values?.iss
    if (!orgSlug) {
        throw new Error('Missing org slug')
    }

    const org = await currentDb().selectFrom('org').selectAll('org').where('slug', '=', orgSlug).executeTakeFirst()
    if (!org) {
        throw new Error('Org not found')
    }

    if (!isEnclaveOrg(org)) {
        throw new Error(`Org ${org.slug} is not an enclave org and cannot validate JWT tokens`)
    }

    const settings = org.settings as { publicKey?: string }
    const publicKey = settings?.publicKey
    if (!publicKey) {
        throw new Error(`Org ${org.slug} does not have a public key configured`)
    }

    const decodedToken = jwt.verify(token, publicKey, { algorithms: ['RS256'] })

    if (!decodedToken) {
        throw new Error(`public key validation failed for JWT.  Org ${org.slug} public key was:\n${publicKey}`)
    }

    return org
}
