// use this page to test the error boundary
'use client'

function ErrorTest(): never {
    throw new Error('Test error')
}

export default function ErrorDemoPage() {
    return <ErrorTest />
}
