import { StudyStatus } from '@/database/types'
import type { Session } from './types'
import { AbilityBuilder, MongoAbility, createMongoAbility, type FieldMatcher } from '@casl/ability'
const fieldMatcher: FieldMatcher = (fields) => (field) => fields.includes(field)

type Record = { id: string }
type UserAbility = ['invite', 'User'] | ['update', 'User' | Record]
type StudyAbilty = ['create', 'Study'] | ['approve', 'Study' | { orgId: string; status: StudyStatus }]
type AppAbility = MongoAbility<UserAbility | StudyAbilty>

export function defineAbilityFor(session: Session) {
    const { isAdmin, isResearcher, isReviewer } = session.roles
    const { can: permit, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

    // The below rules control which roles can perform which tasks
    // they are evaluated in order, a later rule will override a previous one

    if (isResearcher || isAdmin) {
        permit('create', 'Study')
    }

    if (isReviewer || isAdmin) {
        permit('approve', 'Study', { status: { $in: ['INITIATED', 'PENDING-REVIEW'] } })
    }

    // everyone can update themselves
    permit('update', 'User', ['name', 'email'], { id: session.user.id })

    if (isAdmin) {
        permit('invite', 'User')
        permit('update', 'User')
    }

    return build({ fieldMatcher })
}
