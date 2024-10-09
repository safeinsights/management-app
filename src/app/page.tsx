import { footerStyles, mainStyles, pageStyles } from './page.css'
import Link from 'next/link'
import { Button, Title } from '@mantine/core'

export default async function Home() {
    return (
        <div className={pageStyles}>
            <main className={mainStyles}>
                <Title>Welcome to the SafeInsights management app.</Title>
                <Title order={4}>You likely want to visit the OpenStax study proposal page.</Title>
                <Link href="/member/openstax/study-request" passHref>
                    <Button>Proceed to study proposal</Button>
                </Link>
            </main>
            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
