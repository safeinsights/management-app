import { style } from '@vanilla-extract/css'

export const studyRowStyle = style({
    padding: '1rem',
    border: '2px solid black',
    borderBottom: 'none',
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 80px 200px',
    gap: '1rem',
    selectors: {
        '&:last-child': {
            borderBottom: '2px solid black',
        },
    },
})

export const studyStatusStyle = style({
    fontSize: '80%',
    fontFamily: 'monospace',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '1rem',
    borderLeft: '1px solid #ccc', // Right border on the first cell
})

export const studyTitleStyle = style({
    paddingRight: '1rem',
    borderRight: '1px solid #ccc', // Right border on the first cell
})
