import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { ErrorState, StatusBadge } from './ui';

describe('StatusBadge', () => {
  it('uses readable labels for special statuses', () => {
    render(<><StatusBadge value="insufficient_data" /><StatusBadge value={null} /><StatusBadge value="high" /></>);
    expect(screen.getByText('Insufficient data')).toBeInTheDocument();
    expect(screen.getByText('Not assessed')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('shows recovery guidance for an unreachable backend', () => {
    render(<ErrorState error={new ApiError(0, 'Cannot reach the server')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Start the backend');
  });
});
