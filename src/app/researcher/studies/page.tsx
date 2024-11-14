import { db } from '@/database'
import { Container, Flex, Button, Paper, Title, Group, Alert, Anchor } from '@mantine/core'
import { Panel } from './runs-table'
import Link from '../../../../node_modules/next/link'
import { AlertNotFound } from '@/components/errors'
import { studyRowStyle, studyStatusStyle, studyTitleStyle } from './styles.css'
import { humanizeStatus } from '@/lib/status'

export const dynamic = 'force-dynamic'

export default async function StudyReviewPage({
        params: { studyIdentifier },
    }: {
        params: {
            studyIdentifier: string
        }
    }) {

    // TODO check user permissions
 
    const studies = await db
    .selectFrom('study')
    .select(['study.id', 'title', 'piName', 'status'])
    .orderBy('createdAt', 'desc')
    .execute()


    return (
<>

        <Paper m="xl" shadow="xs" p="xl">
        <Container width="100%">
                <Group justify="space-between">
                    <Title>My Research Proposals</Title>
                    <Flex justify="flex-end">
                        <Link href="/researcher/study/request/openstax">
                            <Button mt={30} mb={30}>
                                Create A New Proposal
                            </Button>
                        </Link>
                    </Flex>
                </Group>
                {studies.length === 0 ? (
                    <Alert color="gray" title="No studies">
                        There are no studies to view at this time
                    </Alert>
                ) : (
                    <ul>
                        {studies.map((study) => (
                            <li key={study.id} className={studyRowStyle}>
                                <p className={studyTitleStyle}>{study.title}</p>
                                <p>{study.piName}</p>
                                <p className={studyStatusStyle}>{humanizeStatus(study.status)}</p>
                                <Link href='/researcher/study/review'>
                                    <Anchor>Proceed to review ≫</Anchor>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

            </Container>
        </Paper>
</>

    )
}