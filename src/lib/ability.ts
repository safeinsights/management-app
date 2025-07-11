import { StudyStatus } from '@/database/types';
import type { Session } from './types';
import {
    PureAbility,
    AbilityBuilder,
    type MatchConditions,
    type FieldMatcher,
} from '@casl/ability';
const conditionsMatcher = (matchConditions: MatchConditions) => matchConditions;
const fieldMatcher: FieldMatcher = fields => field => fields.includes(field);

type Record = { id: string }

type UserAbility = ['invite', 'User'] | ['update', 'User' | Record ]

type StudyAbilty = ['create', 'Study'] | ['approve', 'Study' | { orgId: string, status: StudyStatus }]

type AppAbility = PureAbility<UserAbility | StudyAbilty, MatchConditions>


export function defineAbilityFor(session: Session) {
    const { isAdmin, isResearcher, isReviewer } = session.roles
    const { can, build } = new AbilityBuilder<AppAbility>(PureAbility);

    if (isResearcher || isAdmin) {
        can('create', 'Study')
    }

    if (isReviewer || isAdmin) {
        can('approve', 'Study', ({ status }: { status: StudyStatus }) => status == 'PENDING-REVIEW')
    }

    // everyone can update themselves
    can('update', 'User', ['name','email'], (user: Record) => user.id == session.user.id)

    if (isAdmin) {
        can('invite', 'User')
        can('update', 'User', () => true)
    }


    return build({ conditionsMatcher, fieldMatcher });
}
