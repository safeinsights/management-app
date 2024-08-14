import { footerStyles, mainStyles, pageStyles } from './page.css'

export default function Home() {
    return (
        <div className={pageStyles}>
            <main className={mainStyles}>Hello World</main>
            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
