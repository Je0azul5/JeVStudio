import { CloudIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import VoiceSelector from '@shared/components/VoiceSelector';
import { ApiError, apiJson, describeError } from '@/lib/api/client';
import { getBridge } from '@/components/bridge';
import { useBackendStatus } from '@/hooks/use-backend-status';
import { queryKeys } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingsSection, SettingsRow } from './settings-layout';
import { useSettingsAction } from './use-settings-action';

interface AzureTtsConfig {
  enabled: boolean;
  endpoint: string;
  deployment: string;
  api_version: string;
  voice: string;
  instructions: string;
  has_key: boolean;
  voices: string[];
}

export function AzureTtsSettings() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['azure-tts'],
    queryFn: ({ signal }) => apiJson<AzureTtsConfig>('/api/settings/azure-tts', { signal }),
  });
  const [draft, setDraft] = useState<AzureTtsConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const action = useSettingsAction();
  const backend = useBackendStatus();
  const bridge = getBridge();
  const outdated = query.error instanceof ApiError && query.error.status === 404;
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const edit = (values: Partial<AzureTtsConfig>) => {
    setDraft((current) => (current ? { ...current, ...values } : current));
    action.reset();
  };
  const save = (clear = false) =>
    action.run(async () => {
      if (!draft) return;
      const { has_key: _hasKey, voices: _voices, ...settings } = draft;
      const next = await apiJson<AzureTtsConfig>('/api/settings/azure-tts', {
        method: 'PUT',
        body: JSON.stringify({
          ...settings,
          ...(clear
            ? { enabled: false, api_key: '' }
            : apiKey.trim()
              ? { api_key: apiKey.trim() }
              : {}),
        }),
      });
      setApiKey('');
      client.setQueryData(['azure-tts'], next);
      await client.invalidateQueries({ queryKey: queryKeys.engines });
    });
  const busy = action.busy || query.isFetching;
  return (
    <SettingsSection icon={CloudIcon} title={t('azureTts.title')}>
      <p className="p-4 text-sm text-muted-foreground">{t('azureTts.notice')}</p>
      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <SettingsRow id="azure-tts-enabled" title={t('azureTts.enable')}>
            <Switch
              aria-labelledby="azure-tts-enabled"
              checked={draft.enabled}
              disabled={busy}
              onCheckedChange={(enabled) => edit({ enabled })}
            />
          </SettingsRow>
          {(['endpoint', 'deployment', 'api_version', 'instructions'] as const).map((field) => (
            <SettingsRow
              key={field}
              id={'azure-tts-' + field}
              title={t('azureTts.' + field)}
              description={field === 'endpoint' ? t('azureTts.endpointHint') : undefined}
            >
              <Input
                aria-label={t('azureTts.' + field)}
                value={draft[field]}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => edit({ [field]: event.target.value })}
              />
            </SettingsRow>
          ))}
          <SettingsRow id="azure-tts-voice" title={t('clone.voice_kicker')}>
            <VoiceSelector
              value={'preset:' + draft.voice}
              onChange={(voice: string) => edit({ voice: voice.replace(/^preset:/, '') })}
              presetVoices={draft.voices.map((voice) => ({ id: voice, name: voice }))}
              gallery={false}
              engineDefault={false}
              ariaLabel={t('clone.voice_kicker')}
              menuPortal
              disabled={busy}
            />
          </SettingsRow>
          <SettingsRow
            id="azure-tts-api-key"
            title={t('settings.llmp_api_key')}
            description={t(draft.has_key ? 'settings.hf_token_set' : 'settings.hf_token_not_set')}
          >
            <Input
              type="password"
              aria-label={t('settings.llmp_api_key')}
              value={apiKey}
              autoComplete="new-password"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => {
                setApiKey(event.target.value);
                action.reset();
              }}
            />
          </SettingsRow>
          <div className="flex gap-2 p-4">
            <Button type="submit" disabled={busy}>
              {t('common.save')}
            </Button>
            {draft.has_key && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(true)}>
                {t('common.delete')}
              </Button>
            )}
          </div>
        </form>
      )}
      {(query.isError || action.error) && (
        <div role="alert" className="space-y-3 p-4 text-sm text-destructive">
          <p>{outdated ? t('azureTts.backendOutdated') : t('common.error')}</p>
          {query.isError && !outdated && <p>{describeError(query.error)}</p>}
          <div className="flex gap-2">
            {outdated && bridge && backend.managed && !backend.remote && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void action.run(async () => {
                    await bridge.backend.restart();
                    await query.refetch();
                    await client.invalidateQueries({ queryKey: queryKeys.engines });
                  }, false)
                }
              >
                {t('azureTts.restartBackend')}
              </Button>
            )}
            {query.isError && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void query.refetch()}
              >
                {t('common.retry')}
              </Button>
            )}
          </div>
        </div>
      )}
      {query.isPending && (
        <p role="status" className="p-4 text-sm">
          {t('common.loading')}
        </p>
      )}
      {action.saved && (
        <p role="status" className="p-4 text-sm">
          {t('credentials.saved')}
        </p>
      )}
    </SettingsSection>
  );
}
