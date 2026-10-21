import { useCloneDemo } from './use-clone-demo';
import { useStore } from '@tanstack/react-store';
import { useProfiles } from './use-profiles';
import { useCloneSettings } from '@/lib/store/clone-settings';
import { recordingBusyStore, useReference } from '@/lib/store/reference';
import { cloneBlocker } from '@/lib/clone-readiness';
import { useTtsReadiness } from './use-tts-readiness';
import { useEngines } from './use-engines';
export function useCloneInputsReadiness() {
  const demo = useCloneDemo();
  const settings = useCloneSettings();
  const reference = useReference();
  const profiles = useProfiles();
  const recording = useStore(recordingBusyStore);
  const presetOnly = useEngines().activeTts?.supports_cloning === false;
  if (demo && !presetOnly) return 'engine' as const;
  return cloneBlocker({
    text: settings.text,
    profileId: settings.selectedProfileId,
    profiles: profiles.isError ? [] : profiles.data,
    fileSize: reference.file?.size ?? 0,
    busy: recording || reference.pending,
    presetOnly,
  });
}

export function useCloneReadiness() {
  const presetOnly = useEngines().activeTts?.supports_cloning === false;
  const ttsBlocker = useTtsReadiness(presetOnly ? 'tts' : 'clone');
  const inputBlocker = useCloneInputsReadiness();
  return ttsBlocker ?? inputBlocker;
}
