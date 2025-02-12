import { SignIn } from '@/components/signin'
import { pageStyles } from '@/styles/common'
import { Container } from '@/styles/generated/jsx'

export default function Home() {
    return (
        <div className={pageStyles}>
            <Container>
                <SignIn />
            </Container>
        </div>
    )
}
