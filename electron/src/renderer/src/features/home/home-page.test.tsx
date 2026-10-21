import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const browser = vi.hoisted(() => ({ open: vi.fn(async () => {}) }));
const files = vi.hoisted(() => ({ openExternal: vi.fn(async () => {}) }));
vi.mock('@/components/bridge', () => ({ getBridge: () => ({ browser, files }) }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [] }),
}));
vi.mock('@/hooks/use-profiles', () => ({ useProfiles: () => ({ data: [] }) }));
vi.mock('@/components/app-shell/workspace-header', () => ({
  WorkspaceHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { HomePage } from './home-page';
import { homeContributors } from './home-contributors-data';
import en from '@/i18n/locales/en.json';

afterEach(cleanup);

it('keeps the heading and description together beside the contributor artwork', () => {
  render(<HomePage />);
  const heading = screen.getByRole('heading', { name: 'homeUi.title' });
  const description = screen.getByText('homeUi.subtitle');
  const copy = heading.parentElement!;
  expect(copy).toContainElement(description);
  expect(copy.querySelector('.home-contributors')).toBeNull();
  expect(copy.nextElementSibling).toHaveClass('home-contributors');
});

it('shows JeVStudio without linking the title to the upstream website', () => {
  browser.open.mockClear();
  render(<HomePage />);
  expect(en.homeUi.title).toBe('JeVStudio');
  expect(screen.getByRole('heading', { name: 'homeUi.title' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'homeUi.title' })).not.toBeInTheDocument();
  expect(browser.open).not.toHaveBeenCalled();
});

it('names the feature Dubbing consistently while preserving the existing route', () => {
  expect(en.dubWorkspace.title).toBe('Dubbing');
  expect(en.nav.dub).toBe('Dubbing');
  expect(en.keyboard.dub).toBe('Dubbing');
  render(<HomePage />);
  expect(screen.getByRole('link', { name: /dubWorkspace.title/ })).toHaveAttribute('href', '/dub');
});

it('shows only the owner avatar and opens the owner GitHub profile', () => {
  render(<HomePage />);
  expect(homeContributors.map(({ login }) => login)).toEqual(['Je0azul5']);
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.queryByRole('link', { name: 'homeUi.allContributors' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '@debpalash' })).not.toBeInTheDocument();
  const profile = screen.getByRole('link', { name: 'GitHub · @Je0azul5' });
  expect(profile).toHaveAttribute('href', 'https://github.com/Je0azul5');
  expect(profile.querySelectorAll('img')).toHaveLength(1);
  expect(profile.querySelector('img')?.src).not.toMatch(/^https?:\/\/(avatars|github)/);
  fireEvent.click(profile);
  expect(files.openExternal).toHaveBeenCalledWith('https://github.com/Je0azul5');
});

it('separates three primary creation actions and describes all nine destinations', () => {
  render(<HomePage />);
  const clone = screen.getByRole('link', { name: /nav.clone/ });
  const primary = clone.parentElement!;
  expect(Array.from(primary.querySelectorAll('a'), (a) => a.getAttribute('href'))).toEqual([
    '/clone',
    '/design',
    '/dub',
  ]);
  expect(primary.nextElementSibling?.querySelectorAll('a')).toHaveLength(6);
  const icons = document.querySelectorAll('svg.home-feature-svg');
  expect(icons).toHaveLength(9);
  icons.forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
  for (const key of ['design', 'dub', 'stories', 'audiobook', 'transcribe']) {
    expect(screen.getByText('homeUi.' + key)).toBeVisible();
  }
  expect(screen.queryByText('demo.dictation_lede')).not.toBeInTheDocument();
  expect(screen.queryByText('dub.supported_formats')).not.toBeInTheDocument();
  expect(screen.queryByText('clone.history_title')).not.toBeInTheDocument();
  expect(screen.queryByText('0')).not.toBeInTheDocument();
});
