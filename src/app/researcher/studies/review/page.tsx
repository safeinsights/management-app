import { Paper, Center, Title, Text, Stack, Group } from '@mantine/core'
import { b64toUUID } from '@/lib/uuid'
import { StudyPanel } from './panel'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'
import { MemberBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from './actions'

export default async function StudyReviewPage() {
    // TODO check user permissions

    return (
        <Center>
            <Paper w="50%" shadow="xs" p="sm" m="xs">
                <Text>Research Proposal and Research Code Panels will go here!</Text>
            </Paper>
        </Center>
    )
}
