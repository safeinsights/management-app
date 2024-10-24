import { style } from '@vanilla-extract/css'

export const leftPanelStyles = style({
    position: 'relative',
    borderRight: '1px solid #ddd',
})

export const treeStyles = style({
    height: 'calc(100vh - 300px)',
    overflowY: 'auto',
    width: 300,
})

export const codeViewStyles = style({
    position: 'relative',
    fontSize: '80%',
    maxHeight: 'calc(100vh - 300px)',
    maxWidth: 'calc(100vw - 500px)',
    overflow: 'auto',
    flex: 1,
})

export const expandIconStyle = style({
    position: 'absolute',
    right: 10,
    top: 10,
})

export const filePathHeading = style({
    marginBottom: 5,
    paddingBottom: 5,
    borderBottom: '1px solid #ddd',
})
