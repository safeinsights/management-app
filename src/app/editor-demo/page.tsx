import { WS_URL } from '@/server/config'
import { EditorDemoLoader } from './editor-demo-loader'

export default function EditorDemoPage() {
    return <EditorDemoLoader wsUrl={WS_URL} />
}
