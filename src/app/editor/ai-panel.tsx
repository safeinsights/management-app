import {
    XCircle,
    PlayCircle,
 } from '@phosphor-icons/react/dist/ssr'
import { useRef } from 'react'
import { Flex, AppShellAside, Title, UnstyledButton, Text, Textarea, Blockquote, Loader, AppShellSection, ScrollArea } from '@mantine/core'

import { useEditorStore, useShallow, type AiMessage } from './state'
import { useMutation } from '@tanstack/react-query';
import { getEditorAssistedCodeAction } from './editor-actions';
import { reportMutationError } from '@/components/errors';


const Message: React.FC<{ msg: AiMessage }> = ({ msg }) => {
    if (msg.sender == 'assistant') {
        return (
            <Blockquote>
                {msg.message}
            </Blockquote>
        )
    }
    return (
        <Text>
            {msg.message}
        </Text>
    )
}

export function AiPanel() {
    //    const isOpen = useEditorStore(state => state.isDrawerOpen)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const [editor, messages, appendMessagePair] = useEditorStore(useShallow(s => [s.editor, s.aiMessages, s.appendMessagePair]))
    // const editor = useEditorStore(state => state.editor)
    // const messages = useEditorStore(state => state.aiMessages)
    // const appendMessagePair = useEditorStore(state => state.appendMessagePair)
    const close = () => useEditorStore.setState({ isDrawerOpen: false })

    const { isPending, mutate: sendMessage } = useMutation({
        mutationFn: async (..._:unknown[]) => {
            if (!inputRef.current) throw new Error("no input?")
            const message = inputRef.current.value || ''
            const code = editor.getValue()
            const resp = await getEditorAssistedCodeAction({
                code,
                history: messages.concat({ message, sender: 'user' }),
            })
            console.log(resp)
            appendMessagePair(message, `${resp.description}${resp.questions.join('\n\n')}`, code)
            if (resp.updated_code) {
                editor.setValue(resp.updated_code)
            }
            inputRef.current.value = ''
        },
        onError: reportMutationError,
    })
    console.log(messages)
    return (
        <AppShellAside p="md">
            <Flex justify="space-between" align="center" mb="md">
                <Title order={6}>
                    How can SafeInsights AI help you?
                </Title>
                <UnstyledButton onClick={close} aria-label="Close editor drawer">
                    <XCircle size={24} />
                </UnstyledButton>
            </Flex>

            <ScrollArea>
                <Flex flex={1} direction="column">
                    {messages.map((msg, i) => <Message msg={msg} key={i} />)}
                </Flex>
            </ScrollArea>

            <Textarea
                ref={inputRef}
                label={<Flex direction="column">
                           <Text fs='bolder'>What do you need help with?</Text>
                           <Text size="sm">Help us help you by providing as much context as possible.</Text>
                       </Flex>}
                resize="vertical"
                autosize
                disabled={isPending}
                description="Be aware that AI makes mistakes, so always double check the results."
                placeholder="Enter your question here…"
                rightSection={
                    <UnstyledButton onClick={sendMessage} aria-label="Close editor drawer">
                        {isPending ? <Loader size={20} /> : <PlayCircle size={20} />}
                    </UnstyledButton>
                }
            >
            </Textarea>
        </AppShellAside>
    )

}
