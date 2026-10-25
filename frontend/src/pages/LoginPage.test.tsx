import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import LoginPage from './LoginPage';

afterEach(() => vi.restoreAllMocks());

function setup(loginStatus = 401) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/health')) return new Response(JSON.stringify({ status: 'ok', database: 'ok', environment: 'test' }), { status: 200 });
    return new Response(JSON.stringify({ detail: 'Incorrect e-mail or password.', code: 'unauthenticated' }), { status: loginStatus });
  });
  render(<AuthProvider><MemoryRouter><LoginPage /></MemoryRouter></AuthProvider>);
}

describe('LoginPage', () => {
  it('validates fields before calling the API', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid e-mail address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.every(([u]) => String(u).endsWith('/health'))).toBe(true);
  });

  it('shows the server error for bad credentials and the backend status', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.example' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect e-mail or password.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Backend connected/)).toBeInTheDocument());
  });
});
