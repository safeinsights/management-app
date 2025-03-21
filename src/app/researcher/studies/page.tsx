import { db } from '@/database'
import { Alert, Anchor, Button, Container, Flex, Group, Paper, Title } from '@mantine/core'
import Link from '../../../../node_modules/next/link'
import { studyRowStyle, studyStatusStyle, studyTitleStyle } from './styles.css'
import { humanizeStatus } from '@/lib/status'

export const dynamic = 'force-dynamic'

export default async function StudyReviewPage() {
    // TODO check user permissions

    const studies = await db
        .selectFrom('study')
        .select(['study.id', 'title', 'piName', 'status'])
        .orderBy('createdAt', 'desc')
        .execute()

    return (
        <>
            <Paper m="xl" shadow="xs" p="xl">
                <Container>
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
                                    <Anchor component={Link} href={`/researcher/study/${study.id}/review`}>
                                        Proceed to review ≫
                                    </Anchor>
                                </li>
                            ))}
                        </ul>
                    )}
                </Container>
            </Paper>
        </>
    )
}
