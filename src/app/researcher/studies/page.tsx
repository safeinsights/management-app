import { db } from '@/database'
import { Container } from '@mantine/core'
import { Panel } from './runs-table'

export const dynamic = 'force-dynamic'

export default async function ListStudiesPage() {
    // TODO: only show researchers studies

    const studies = await db
        .selectFrom('study')
        .select(['study.id', 'title', 'containerLocation', 'description'])
        .orderBy('createdAt', 'desc')
        .execute()

    return (
        <Container>
            <Panel studies={studies} />
        </Container>
    )
}
