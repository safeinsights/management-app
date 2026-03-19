import { DEPLOYED_ENV } from '@/server/config'
import { EditorDemoLoader } from './editor-demo-loader'

export default function EditorDemoPage() {
    const wsUrl = DEPLOYED_ENV ? '/ws' : 'ws://localhost:1234'

    return <EditorDemoLoader wsUrl={wsUrl} />
}
