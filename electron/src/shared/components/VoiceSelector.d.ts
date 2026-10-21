import type { ComponentType } from 'react';

interface VoiceSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  profiles?: { id: string; name?: string; instruct?: string | null }[];
  presetVoices?: { id: string; name: string }[];
  presets?: boolean;
  gallery?: boolean;
  engineDefault?: boolean;
  defaultLabel?: string;
  speakerClones?: Record<string, unknown> | null;
  onPreview?: (value: string) => void;
  previewLoading?: boolean;
  onJumpToGallery?: () => void;
  onCreateVoice?: () => void;
  recentsKey?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  size?: string;
  buttonClassName?: string;
  menuPortal?: boolean;
  menuClassName?: string;
}

declare const VoiceSelector: ComponentType<VoiceSelectorProps>;
export default VoiceSelector;
