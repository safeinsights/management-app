import { Title, Container } from '@mantine/core'
import { pageStyles, mainStyles, footerStyles } from '@/styles/common'
import InviteForm from '@/components/clerkcustom/invite-form'

export default async function InvitePage() {
    return (
        <div className={pageStyles}>
            <main className={mainStyles}>
                <Container size="sm">
                    <Title mb="lg">Invite New Users</Title>
                    <InviteForm />
                </Container>
            </main>
        </div>
    )
}
