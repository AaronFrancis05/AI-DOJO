'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/Card';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { SliderRow } from '@/components/ui/SliderRow';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { GenderPicker } from '@/components/ui/GenderPicker';
import { getCharacters } from '@/lib/data/characters';
import type { CharacterFixture } from '@/lib/data/characters';
import { useUser } from '@/lib/auth/user-context';
import { useAvatar } from '@/lib/auth/avatar-context';
import { AvaturnConnector } from '@/components/roleplay/AvaturnConnector';
import Link from 'next/link';
import { ArrowLeft, Smile, UserCheck, Headphones, Star, Plus, Trash2, User } from 'lucide-react';

const ProfilePortrait = dynamic(() => import('@/components/roleplay/avatar-variants/ProfilePortrait').then(m => ({ default: m.ProfilePortrait })), {
  ssr: false,
  loading: () => (
    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-dojo-surface animate-pulse">
      <div className="h-12 w-12 rounded-full bg-dojo-border" />
    </div>
  ),
});

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

export default function AvatarSettingsPage() {
  const user = useUser();
  const { avatars, selectedAvatar, loading, selectAvatar, deleteAvatar } = useAvatar();
  const [showAvaturn, setShowAvaturn] = useState(false);
  const [voiceSpeed, setVoiceSpeed] = useState(50);
  const [voicePitch, setVoicePitch] = useState(50);
  const [characters, setCharacters] = useState<CharacterFixture[]>([]);
  const [savingGender, setSavingGender] = useState<Record<number, boolean>>({});

  useEffect(() => {
    getCharacters().then(res => setCharacters(res.data));
  }, []);

  async function handleGenderChange(charId: number, gender: string) {
    const prev = characters;
    setCharacters(prev => prev.map(c => c.id === charId ? { ...c, gender } : c));
    setSavingGender(g => ({ ...g, [charId]: true }));
    try {
      const res = await fetch(`/api/characters/${charId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gender }),
      });
      if (!res.ok) {
        setCharacters(prev);
      }
    } catch {
      setCharacters(prev);
    }
    setSavingGender(g => ({ ...g, [charId]: false }));
  }

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
                    <div className="h-28 w-28 overflow-hidden rounded-full border-2 border-dojo-border">
                      {selectedAvatar ? (
                        <ProfilePortrait
                          modelUrl={selectedAvatar.avatarUrl}
                          userName={user?.name}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-dojo-surface text-dojo-text-muted">
                          <User className="h-10 w-10" />
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-lg font-semibold text-dojo-text-primary">
                      {user?.name ?? 'You'}
                    </p>
                    {selectedAvatar && <Badge variant="accent" className="mt-1">Current</Badge>}
                    {!selectedAvatar && !loading && (
                      <p className="mt-1 text-xs text-dojo-text-muted">No avatar set — connect Avaturn to create one.</p>
                    )}
                  </div>

                  {/* Avatar collection grid */}
                  <div>
                    <h4 className="text-sm font-semibold text-dojo-text-primary mb-3">
                      Your Avatars {avatars.length > 0 && <span className="text-dojo-text-muted font-normal">({avatars.length})</span>}
                    </h4>

                    {loading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-dojo-accent border-t-transparent" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                        {/* Existing avatars */}
                        {avatars.map((av) => (
                          <div
                            key={av.id}
                            className="relative group"
                          >
                            <button
                              onClick={() => selectAvatar(av.id)}
                              className={`flex flex-col items-center gap-2 rounded-xl border p-3 w-full transition-all ${
                                av.isSelected
                                  ? 'border-dojo-accent bg-dojo-accent/5 ring-2 ring-dojo-accent/30'
                                  : 'border-dojo-border hover:border-dojo-text-muted'
                              }`}
                            >
                              <div className="flex h-12 w-12 items-center justify-center rounded-full overflow-hidden bg-dojo-surface">
                                {av.thumbnailUrl && !av.thumbnailUrl.endsWith('.glb') ? (
                                  <img
                                    src={av.thumbnailUrl}
                                    alt="Avatar"
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <User className="h-6 w-6 text-dojo-text-muted" />
                                )}
                              </div>
                              {av.isSelected && (
                                <span className="text-[10px] font-bold text-dojo-accent">Current</span>
                              )}
                            </button>

                            {/* Delete button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Remove this avatar?')) deleteAvatar(av.id);
                              }}
                              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-dojo-danger text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}

                        {/* Add new via Avaturn */}
                        <button
                          onClick={() => setShowAvaturn(true)}
                          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-dojo-border hover:border-dojo-accent p-3 transition-all min-h-[96px]"
                        >
                          <Plus className="h-6 w-6 text-dojo-text-muted" />
                          <span className="text-xs font-medium text-dojo-text-muted text-center leading-tight">Connect Avaturn</span>
                        </button>
                      </div>
                    )}
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
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-dojo-text-primary">{char.name}</p>
                              <p className="text-xs text-dojo-text-muted truncate">{char.voiceType}</p>
                            </div>
                            <GenderPicker
                              value={char.gender as 'female' | 'male'}
                              onChange={(g) => handleGenderChange(char.id, g)}
                              disabled={savingGender[char.id]}
                            />
                            <Badge variant="default" className="capitalize hidden sm:inline-flex">
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

      {showAvaturn && (
        <AvaturnConnector onClose={() => setShowAvaturn(false)} />
      )}
    </div>
  );
}
