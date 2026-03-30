import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './ui/button';

describe('Button Component', () => {
    it('renders the button with provided text', () => {
        render(<Button>Click Me</Button>);
        expect(screen.getByText('Click Me')).toBeInTheDocument();
    });

    it('triggers onClick when clicked', () => {
        const handleClick = vi.fn();
        render(<Button onClick={handleClick}>Click Me</Button>);
        fireEvent.click(screen.getByText('Click Me'));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('applies the correct variant classes', () => {
        render(<Button variant="destructive">Delete</Button>);
        const button = screen.getByText('Delete');
        expect(button).toHaveClass('bg-destructive');
    });

    it('disables the button when disabled prop is true', () => {
        render(<Button disabled>Disabled</Button>);
        const button = screen.getByText('Disabled');
        expect(button).toBeDisabled();
    });
});
