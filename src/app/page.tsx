import { Title } from '@mantine/core'
import { pageStyles, mainStyles, footerStyles } from '@/styles/common'

export default function Home() {
    return (
        <div className={pageStyles}>
            <main className={mainStyles}>
                <Title>Hello World</Title>
            </main>
            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
