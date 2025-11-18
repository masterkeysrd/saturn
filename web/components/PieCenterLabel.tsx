import { styled } from "@mui/material";
import { useDrawingArea } from "@mui/x-charts";

interface StyledTextProps {
    variant: 'primary' | 'secondary';
}

const StyledText = styled('text', {
    shouldForwardProp: (prop) => prop !== 'variant',
})<StyledTextProps>(({ theme }) => ({
    textAnchor: 'middle',
    dominantBaseline: 'central',
    fill: (theme.vars || theme).palette.text.secondary,
    variants: [
        {
            props: {
                variant: 'primary',
            },
            style: {
                fontSize: theme.typography.h5.fontSize,
            },
        },
        {
            props: ({ variant }) => variant !== 'primary',
            style: {
                fontSize: theme.typography.body2.fontSize,
            },
        },
        {
            props: {
                variant: 'primary',
            },
            style: {
                fontWeight: theme.typography.h5.fontWeight,
            },
        },
        {
            props: ({ variant }) => variant !== 'primary',
            style: {
                fontWeight: theme.typography.body2.fontWeight,
            },
        },
    ],
}));

interface PieCenterLabelProps {
    primaryText: string;
    secondaryText: string;
}

export default function PieCenterLabel({ primaryText, secondaryText }: PieCenterLabelProps) {
    const { width, height, left, top } = useDrawingArea();
    const primaryY = top + height / 2 - 10;
    const secondaryY = primaryY + 24;

    return (
        <>
            <StyledText variant="primary" x={left + width / 2} y={primaryY}>
                {primaryText}
            </StyledText>
            <StyledText variant="secondary" x={left + width / 2} y={secondaryY}>
                {secondaryText}
            </StyledText>
        </>
    );
}


