import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../context/AuthContext';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../context/AuthContext', () => ({
    useAuth: vi.fn(),
}));

// Mock Navigate to prevent actual navigation during tests
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        Navigate: ({ to }) => <div data-testid={`navigate-${to}`} />,
    };
});

describe('ProtectedRoute', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('shows loading state initially', () => {
        useAuth.mockReturnValue({ loading: true, user: null });
        render(
            <BrowserRouter>
                <ProtectedRoute>
                    <div data-testid="protected-content">Secret</div>
                </ProtectedRoute>
            </BrowserRouter>
        );
        expect(screen.getByText(/Authorizing Session/i)).toBeInTheDocument();
        expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('redirects to login if user is not authenticated', () => {
        useAuth.mockReturnValue({ loading: false, user: null });
        render(
            <BrowserRouter>
                <ProtectedRoute>
                    <div data-testid="protected-content">Secret</div>
                </ProtectedRoute>
            </BrowserRouter>
        );
        expect(screen.getByTestId('navigate-/login')).toBeInTheDocument();
    });

    it('renders children if user is authenticated', () => {
        useAuth.mockReturnValue({ loading: false, user: { id: '1' } });
        render(
            <BrowserRouter>
                <ProtectedRoute>
                    <div data-testid="protected-content">Secret content</div>
                </ProtectedRoute>
            </BrowserRouter>
        );
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
        expect(screen.getByText('Secret content')).toBeInTheDocument();
    });

    it('redirects non-admins to home if adminOnly is true', () => {
        useAuth.mockReturnValue({ loading: false, user: { id: '1' }, profile: { role: 'user' } });
        render(
            <BrowserRouter>
                <ProtectedRoute adminOnly>
                    <div data-testid="admin-content">Admin Sector</div>
                </ProtectedRoute>
            </BrowserRouter>
        );
        expect(screen.getByTestId('navigate-/')).toBeInTheDocument();
    });

    it('renders admin content if user is admin', () => {
        useAuth.mockReturnValue({ loading: false, user: { id: '1' }, profile: { role: 'admin' } });
        render(
            <BrowserRouter>
                <ProtectedRoute adminOnly>
                    <div data-testid="admin-content">Admin Sector</div>
                </ProtectedRoute>
            </BrowserRouter>
        );
        expect(screen.getByTestId('admin-content')).toBeInTheDocument();
        expect(screen.getByText('Admin Sector')).toBeInTheDocument();
    });
});
