/* ───────────────────────────────────────────────
   Avatar & Character Settings (Panel 14)
   Tabbed: My Avatar / AI Voice Preferences
   ─────────────────────────────────────────────── */

'use client';

import { Card } from '@/components/ui/Card';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { SliderRow } from '@/components/ui/SliderRow';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { characters } from '@/lib/data/characters';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Smile, UserCheck, Headphones, Star } from 'lucide-react';

const tabs: Tab[] = [
  { id: 'avatar', label: 'My Avatar' },
  { id: 'voice', label: 'AI Voice Preferences' },
];

const avatarIconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Smile,
  UserCheck,
  Headphones,
  Star,
};

const presetAvatars = [
  { name: 'Alex', color: '#2D3BC5', icon: 'Smile' },
  { name: 'Maya', color: '#D14343', icon: 'UserCheck' },
  { name: 'Ryo', color: '#2FAE66', icon: 'Headphones' },
  { name: 'Lena', color: '#E3A939', icon: 'Star' },
  { name: 'Kai', color: '#9333EA', icon: 'Smile' },
  { name: 'Nina', color: '#06B6D4', icon: 'UserCheck' },
];

export default function AvatarSettingsPage() {
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [voiceSpeed, setVoiceSpeed] = useState(50);
  const [voicePitch, setVoicePitch] = useState(50);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1 text-sm text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>

      <h1 className="text-2xl font-bold text-dojo-text-primary mb-8">Avatar &amp; Character</h1>

      <Card>
        <Tabs tabs={tabs} renderPanel={(tabId) => {
          switch (tabId) {
            case 'avatar':
              return (
                <div className="space-y-6">
                  {/* Current avatar preview */}
                  <div className="flex flex-col items-center">
                    <Avatar
                      name={presetAvatars[selectedAvatar].name}
                      color={presetAvatars[selectedAvatar].color}
                      size="xl"
                    />
                    <p className="mt-3 text-lg font-semibold text-dojo-text-primary">
                      {presetAvatars[selectedAvatar].name}
                    </p>
                    <Badge variant="accent" className="mt-1">Current</Badge>
                  </div>

                  {/* Avatar presets */}
                  <div>
                    <h4 className="text-sm font-semibold text-dojo-text-primary mb-3">Choose Your Avatar</h4>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                      {presetAvatars.map((avatar, i) => {
                        const Icon = avatarIconMap[avatar.icon] ?? Smile;
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedAvatar(i)}
                            className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-all ${
                              selectedAvatar === i
                                ? 'border-dojo-accent bg-dojo-accent/5'
                                : 'border-dojo-border hover:border-dojo-text-muted'
                            }`}
                          >
                            <div
                              className="flex h-12 w-12 items-center justify-center rounded-full"
                              style={{ backgroundColor: avatar.color + '33' }}
                            >
                              <Icon className="h-6 w-6" style={{ color: avatar.color }} />
                            </div>
                            <span className="text-xs font-medium text-dojo-text-primary">{avatar.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            case 'voice':
              return (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-dojo-text-primary mb-3">AI Character Voices</h4>
                    <div className="space-y-3">
                      {characters.map((char) => {
                        const Icon = avatarIconMap[char.avatarIcon] ?? Smile;
                        return (
                          <div
                            key={char.id}
                            className="flex items-center gap-3 rounded-xl bg-dojo-surface border border-dojo-border p-3"
                          >
                            <div
                              className="flex h-10 w-10 items-center justify-center rounded-full"
                              style={{ backgroundColor: char.avatarColor + '33' }}
                            >
                              <Icon className="h-5 w-5" style={{ color: char.avatarColor }} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-dojo-text-primary">{char.name}</p>
                              <p className="text-xs text-dojo-text-muted">{char.voiceType}</p>
                            </div>
                            <Badge variant="default" className="capitalize">
                              {char.role.split('/')[0].trim()}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-dojo-border pt-5 space-y-4">
                    <SliderRow
                      label="Speech Speed"
                      description="How fast the AI speaks"
                      value={voiceSpeed}
                      onChange={setVoiceSpeed}
                      showValue
                    />
                    <SliderRow
                      label="Voice Pitch"
                      description="Higher or lower pitch"
                      value={voicePitch}
                      onChange={setVoicePitch}
                      showValue
                    />
                    <Toggle
                      label="Auto-play AI responses"
                      description="Automatically play audio when AI responds"
                      enabled={true}
                      onChange={() => {}}
                    />
                  </div>
                </div>
              );
            default:
              return null;
          }
        }} />
      </Card>
    </div>
  );
}
