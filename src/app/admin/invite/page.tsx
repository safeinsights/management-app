import { Title, Container } from '@mantine/core'
import { pageStyles, mainStyles, footerStyles } from '@/styles/common'
import { OrganizationSelect } from '@/components/clerkcustom/organization-select'
import { getAllOrganizations } from '@/server/actions/organization-actions'
import InviteForm from '@/components/clerkcustom/invite-form'

export default async function InvitePage() {
    const organizations = await getAllOrganizations()

    return (
        <div className={pageStyles}>
            <main className={mainStyles}>
                <Container size="sm">
                    <Title mb="lg">Invite New Users</Title>
                    <InviteForm organizations={organizations} />
                </Container>
            </main>
        </div>
    )
}
