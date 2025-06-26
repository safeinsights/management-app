import { headers } from 'next/headers'

import { db } from '@/database'
import jwt from 'jsonwebtoken'
import { Org } from '@/schema/org'

export const orgFromAuthToken = async (): Promise<Org> => {
    const authHeader = (await headers()).get('Authorization') || ''

    // Check if the Authorization header is present and well-formed
    if (!authHeader.startsWith('Bearer ')) {
        const availableHeaders = Array.from((await headers()).entries())
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n')
        throw new Error(`'Authorization' header missing or not well formed.  Headers are:\n${availableHeaders}`)
    }

    const token = authHeader.replace('Bearer ', '')

    const values = jwt.decode(token, { json: true })

    const orgSlug = values?.iss
    if (!orgSlug) {
        throw new Error('Missing org slug')
    }

    const org = await db.selectFrom('org').selectAll('org').where('slug', '=', orgSlug).executeTakeFirst()
    if (!org) {
        throw new Error('Org not found')
    }

    // Verify and decode the JWT
    const decodedToken = jwt.verify(token, org.publicKey, { algorithms: ['RS256'] })

    if (!decodedToken) {
        throw new Error(`public key validation failed for JWT.  Org ${org.slug} public key was:\n${org.publicKey}`)
    }

    return org
}
