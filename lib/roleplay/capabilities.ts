export type SttProvider = 'web-speech-api' | 'disabled';
export type TtsProvider = 'disabled' | 'web-speech-api';
export type AvatarRenderer = 'placeholder-fbx' | 'fbx' | '<future renderer>';

export interface RoleplayCapabilities {
  stt: SttProvider;
  tts: TtsProvider;
  avatarRenderer: AvatarRenderer;
}

export const roleplayCapabilities: RoleplayCapabilities = {
  stt: 'web-speech-api',
  tts: 'web-speech-api',
  avatarRenderer: 'fbx',
};
