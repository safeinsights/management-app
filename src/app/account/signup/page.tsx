import { SignUp } from '@/components/signup'
import { pageStyles } from '@/styles/common'
import { Container } from '@/styles/generated/jsx'

export default function SignUpPage() {
    return (
        <div className={pageStyles}>
            <Container>
                <SignUp />
            </Container>
        </div>
    )
}
