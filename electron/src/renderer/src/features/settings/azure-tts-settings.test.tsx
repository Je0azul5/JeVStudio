import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, apiJson } from '@/lib/api/client';
import { AzureTtsSettings } from './azure-tts-settings';

const restart = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/components/bridge', () => ({ getBridge: () => ({ backend: { restart } }) }));
vi.mock('@/hooks/use-backend-status', () => ({
  useBackendStatus: () => ({ managed: true, remote: false }),
}));

vi.mock('@/lib/api/client', async (load) => ({
  ...(await load<typeof import('@/lib/api/client')>()),
  apiJson: vi.fn(),
}));
vi.mock('react-i18next', async (load) => ({
  ...(await load<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderConfig(hasKey = false) {
  const initial = {
    enabled: false,
    endpoint: '',
    deployment: '',
    api_version: '2025-03-01-preview',
    voice: 'alloy',
    instructions: '',
    has_key: hasKey,
    voices: ['alloy', 'coral'],
  };
  vi.mocked(apiJson).mockImplementation(async (_path, options) => {
    if (options?.method === 'PUT') {
      const { api_key, ...values } = JSON.parse(options.body as string);
      return { ...initial, ...values, has_key: Boolean(api_key) };
    }
    return initial;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AzureTtsSettings />
    </QueryClientProvider>,
  );
  return client;
}

it('saves Azure credentials only on submit and never caches the secret', async () => {
  const client = renderConfig();
  const endpoint = await screen.findByRole('textbox', { name: 'azureTts.endpoint' });
  fireEvent.change(endpoint, { target: { value: 'https://example.openai.azure.com' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'azureTts.deployment' }), {
    target: { value: 'custom-deployment' },
  });
  const key = screen.getByLabelText('settings.llmp_api_key', { selector: 'input' });
  expect(key).toHaveAttribute('type', 'password');
  fireEvent.change(key, { target: { value: 'azure-private-key' } });
  fireEvent.click(screen.getByRole('switch', { name: 'azureTts.enable' }));
  expect(
    vi.mocked(apiJson).mock.calls.filter(([, options]) => options?.method === 'PUT'),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('credentials.saved');
  const saved = vi.mocked(apiJson).mock.calls.find(([, options]) => options?.method === 'PUT')!;
  expect(JSON.parse(saved[1]!.body as string)).toMatchObject({
    api_key: 'azure-private-key',
    enabled: true,
    deployment: 'custom-deployment',
  });
  expect(key).toHaveValue('');
  expect(JSON.stringify(client.getQueryData(['azure-tts']))).not.toContain('azure-private-key');
});

it('can delete the saved key and disable cloud speech', async () => {
  renderConfig(true);
  fireEvent.click(await screen.findByRole('button', { name: 'common.delete' }));
  await waitFor(() =>
    expect(
      vi.mocked(apiJson).mock.calls.some(([, options]) => {
        if (options?.method !== 'PUT') return false;
        const body = JSON.parse(options.body as string);
        return body.api_key === '' && body.enabled === false;
      }),
    ).toBe(true),
  );
});

it('recovers from an older backend without an Azure settings route', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(404, 'Not Found'));
  render(
    <QueryClientProvider client={client}>
      <AzureTtsSettings />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('azureTts.backendOutdated');
  expect(restart).not.toHaveBeenCalled();
  vi.mocked(apiJson).mockResolvedValue({
    enabled: false,
    endpoint: '',
    deployment: '',
    api_version: '2025-03-01-preview',
    voice: 'alloy',
    instructions: '',
    has_key: false,
    voices: ['alloy'],
  });
  fireEvent.click(screen.getByRole('button', { name: 'azureTts.restartBackend' }));
  await screen.findByRole('textbox', { name: 'azureTts.endpoint' });
  expect(restart).toHaveBeenCalledOnce();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
