import { SignIn } from './signin'
import { pageStyles } from '@/styles/common'
import { Container } from '@/styles/generated/jsx'

export default function SigninPage() {
    return (
        <div className={pageStyles}>
            <Container>
                <SignIn />
            </Container>
        </div>
    )
}
