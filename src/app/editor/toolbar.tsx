import {
    Command,
    Sparkle,
 } from '@phosphor-icons/react/dist/ssr'
import { Tooltip, UnstyledButton } from '@mantine/core';


import { Flex } from '@mantine/core';

import { useEditorStore } from './state';

interface ToolbarAction {
    icon: React.ReactNode
    label: string
    onClick(): void
}

function NavbarLink({ icon: Icon, label, onClick }: ToolbarAction) {
    return (
        <Tooltip label={label} withArrow position="bottom-end" arrowSize={6}>
            <UnstyledButton onClick={onClick}>
                {Icon}
            </UnstyledButton>
        </Tooltip>
    );
}


export function EditorToolbar() {
    const editor = useEditorStore(state => state.editor)
    const isDrawerOpen = useEditorStore(state => state.isDrawerOpen)
    const toggleDrawer = () => useEditorStore.setState(state => ({ isDrawerOpen: !state.isDrawerOpen }))

    if (!editor) { return null; }

    return (
        <Flex component='nav' gap="lg" p="md" justify="end">
            <NavbarLink icon={<Command size={20} />} label="Commands (F1)"  onClick={() => {
                editor.focus(); // Editor needs focus to be able to trigger command
                editor.trigger("", "editor.action.quickCommand", ""); // Opens the quickcommand
            }} />

            <NavbarLink icon={<Sparkle size={20} fill={isDrawerOpen ? 'gray' : undefined} weight={isDrawerOpen ? 'fill' : 'regular'} />} label="AI help" onClick={toggleDrawer}  />
        </Flex>
    );
}
