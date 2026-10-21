import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: any) => select({ location: { pathname: '/settings/general' } }),
}));
vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({ mode: 'dark', setTheme: vi.fn(), updateTheme: vi.fn() }),
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { SettingsPage } from './settings-page';
import { supportRoute } from '@/routes';

afterEach(cleanup);

it.each([false, true])('redirects old Support links to Appearance (compare=%s)', (compare) => {
  expect.assertions(1);
  try {
    supportRoute.options.beforeLoad?.({ search: { compare } } as never);
  } catch (error) {
    expect(error).toMatchObject({
      options: { to: '/settings/appearance', replace: true },
    });
  }
});

it('removes support from the settings navigation and search', () => {
  const { container } = render(<SettingsPage />);
  expect(screen.getByRole('link', { name: 'preferences.general' })).toBeVisible();
  expect(container.querySelector('a[href="/settings/support"]')).toBeNull();
  expect(screen.queryByText('donate.title')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'preferences.search' }), {
    target: { value: 'donate' },
  });
  expect(container.querySelector('a[href="/settings/support"]')).toBeNull();
  expect(screen.queryByText('donate.title')).not.toBeInTheDocument();
});
