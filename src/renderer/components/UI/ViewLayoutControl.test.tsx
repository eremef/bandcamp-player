import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewLayoutControl } from './ViewLayoutControl';

function setup() {
    const props = {
        viewMode: 'grid' as const,
        coverSize: 'medium' as const,
        onViewModeChange: vi.fn(),
        onCoverSizeChange: vi.fn(),
    };
    return { ...render(<ViewLayoutControl {...props} />), props };
}

describe('ViewLayoutControl', () => {
    it('shows selected options and forwards controlled changes', () => {
        const { props, rerender } = setup();
        const trigger = screen.getByRole('button', { name: 'Layout and cover size' });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(within(screen.getByRole('group', { name: 'Layout' })).getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Grid' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'List' }));
        expect(props.onViewModeChange).toHaveBeenCalledExactlyOnceWith('list');
        expect(props.onCoverSizeChange).not.toHaveBeenCalled();
        expect(trigger).toHaveFocus();
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        rerender(<ViewLayoutControl {...props} viewMode="list" coverSize="large" />);
        fireEvent.click(trigger);
        expect(screen.getByRole('group', { name: 'Thumbnail Size' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'List' })).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Large' })).toHaveAttribute('aria-pressed', 'true');
    });

    it.each(['small', 'medium', 'large'] as const)('selects %s without changing the layout', size => {
        const { props } = setup();
        fireEvent.click(screen.getByTestId('view-toggle-btn'));
        fireEvent.click(screen.getByTestId(`cover-${size}-btn`));
        expect(props.onCoverSizeChange).toHaveBeenCalledExactlyOnceWith(size);
        expect(props.onViewModeChange).not.toHaveBeenCalled();
        expect(screen.getByTestId('view-toggle-btn')).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByTestId('view-toggle-btn')).toHaveFocus();
    });

    it('keeps inside clicks open and dismisses on outside mousedown', () => {
        setup();
        fireEvent.click(screen.getByTestId('view-toggle-btn'));
        fireEvent.mouseDown(screen.getByText('Cover Size'));
        expect(screen.getByRole('group', { name: 'Cover Size' })).toBeInTheDocument();
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('group')).not.toBeInTheDocument();
    });

    it('supports keyboard opening, tab traversal, activation, and Escape', async () => {
        setup();
        const user = userEvent.setup();
        const trigger = screen.getByTestId('view-toggle-btn');
        await user.tab();
        expect(trigger).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(screen.getByRole('button', { name: 'Grid' })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'List' })).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(trigger).toHaveFocus();
        expect(screen.queryByRole('group')).not.toBeInTheDocument();
        await user.keyboard(' ');
        await user.tab();
        await user.keyboard(' ');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger).toHaveFocus();
    });

    it('dismisses when focus moves outside without stealing focus', async () => {
        const { props, rerender } = setup();
        rerender(<><ViewLayoutControl {...props} /><button>Outside</button></>);
        const user = userEvent.setup();
        await user.click(screen.getByTestId('view-toggle-btn'));
        for (let i = 0; i < 5; i++) await user.tab();
        expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
        expect(screen.queryByRole('group')).not.toBeInTheDocument();
    });

    it('assigns unique controls IDs and supports prefixed instances', () => {
        const { props, rerender } = setup();
        rerender(<><ViewLayoutControl {...props} /><ViewLayoutControl {...props} testIdPrefix="artists" /></>);
        fireEvent.click(screen.getByTestId('view-toggle-btn'));
        const firstId = screen.getByTestId('view-toggle-btn').getAttribute('aria-controls');
        fireEvent.click(screen.getByTestId('artists-view-toggle-btn'));
        const secondId = screen.getByTestId('artists-view-toggle-btn').getAttribute('aria-controls');
        expect(firstId).not.toBe(secondId);
        expect(screen.getByTestId('artists-view-list-btn')).toBeInTheDocument();
        expect(screen.getByTestId('artists-cover-small-btn')).toBeInTheDocument();
    });

    it('removes document listeners after unmount', () => {
        const remove = vi.spyOn(document, 'removeEventListener');
        const { unmount } = setup();
        fireEvent.click(screen.getByTestId('view-toggle-btn'));
        unmount();
        expect(remove).toHaveBeenCalledWith('mousedown', expect.any(Function));
        expect(remove).toHaveBeenCalledWith('focusin', expect.any(Function));
        remove.mockRestore();
    });
});
