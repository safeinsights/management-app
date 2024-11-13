import { style } from '@vanilla-extract/css'

export const studyRowStyle = style({
    padding: '1rem',
    border: '2px solid black',
    borderBottom: 'none',
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 200px',
    gap: '1rem',
    selectors: {
        '&:last-child': {
            borderBottom: '2px solid black',
        },
    },
})

export const studyTitleStyle = style({
    borderRight: '1px solid #ccc', // Right border on the first cell
})
