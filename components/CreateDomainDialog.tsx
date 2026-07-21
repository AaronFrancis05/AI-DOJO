'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { X, Plus, Trash2 } from 'lucide-react';
import { TARGET_LANGUAGES, NATIVE_LANGUAGES } from '@/lib/language';
import type { CharacterFixture } from '@/lib/mock-data/characters';

interface VocabItem {
  japanese: string;
  romaji: string;
  english: string;
}

export function CreateDomainDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<CharacterFixture[]>([]);

  const [domainName, setDomainName] = useState('');
  const [situationTitle, setSituationTitle] = useState('');
  const [context, setContext] = useState('');
  const [learningGoals, setLearningGoals] = useState('');
  const [vocabItems, setVocabItems] = useState<VocabItem[]>([
    { japanese: '', romaji: '', english: '' },
  ]);
  const [targetLanguage, setTargetLanguage] = useState('ja');
  const [nativeLanguage, setNativeLanguage] = useState('en');
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [skillLevel, setSkillLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [behaviorMode, setBehaviorMode] = useState<'standard' | 'trouble'>('standard');

  useEffect(() => {
    if (!open) return;
    setCharacters([]);
    fetch('/api/characters')
      .then(r => r.json())
      .then(body => {
        if (body.success) setCharacters(body.characters);
      })
      .catch(() => {});
  }, [open]);

  const handleSubmit = async () => {
    if (!domainName.trim() || !situationTitle.trim() || !context.trim() || !learningGoals.trim()) {
      setError('Please fill in domain name, situation title, context, and learning goals.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/domains/create-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainName: domainName.trim(),
          situationTitle: situationTitle.trim(),
          context: context.trim(),
          learningGoals: learningGoals.trim(),
          vocabulary: vocabItems.filter(v => v.japanese.trim() && v.english.trim()),
          targetLanguage,
          nativeLanguage,
          characterId,
          skillLevel,
          behaviorMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create scenario.'); setLoading(false); return; }
      router.push(`/session/${data.sessionId}`);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  const addVocab = () => { if (vocabItems.length < 5) setVocabItems([...vocabItems, { japanese: '', romaji: '', english: '' }]); };
  const removeVocab = (i: number) => setVocabItems(vocabItems.filter((_, idx) => idx !== i));
  const updateVocab = (i: number, field: keyof VocabItem, val: string) => {
    const next = [...vocabItems];
    next[i] = { ...next[i], [field]: val };
    setVocabItems(next);
  };

  if (!open) return null;

  const inputCls =
    'w-full rounded-[--radius-md] border border-dojo-border bg-dojo-surface-raised px-3 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted/50 focus:outline-none focus:border-dojo-accent transition-colors';
  const labelCls = 'block text-xs font-medium text-dojo-text-muted mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[--radius-lg] border border-dojo-border bg-dojo-sidebar p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 text-dojo-text-muted hover:text-dojo-text-primary transition-colors">
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-dojo-text-primary">Create Custom Scenario</h2>
        <p className="text-sm text-dojo-text-muted mt-1 mb-6">Design your own roleplay practice session</p>

        <div className="space-y-5">
          {/* Domain Name */}
          <div>
            <label className={labelCls}>Domain Name *</label>
            <input type="text" value={domainName} onChange={e => setDomainName(e.target.value)} placeholder="e.g. Bank, Post Office, Gym" className={inputCls} />
          </div>

          {/* Situation Title */}
          <div>
            <label className={labelCls}>Situation Title *</label>
            <input type="text" value={situationTitle} onChange={e => setSituationTitle(e.target.value)} placeholder="e.g. Opening a Bank Account" className={inputCls} />
          </div>

          {/* Context */}
          <div>
            <label className={labelCls}>Context *</label>
            <textarea value={context} onChange={e => setContext(e.target.value)} placeholder="Describe the scenario — what's happening, where, and why" rows={3} className={`${inputCls} resize-none`} />
          </div>

          {/* Learning Goals */}
          <div>
            <label className={labelCls}>Learning Goals *</label>
            <textarea value={learningGoals} onChange={e => setLearningGoals(e.target.value)} placeholder="What should the learner achieve? (one per line)" rows={3} className={`${inputCls} resize-none`} />
          </div>

          {/* Vocabulary */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-dojo-text-muted">Key Vocabulary (max 5)</span>
              {vocabItems.length < 5 && (
                <button type="button" onClick={addVocab} className="flex items-center gap-1 text-xs text-dojo-accent hover:text-dojo-accent/80 transition-colors">
                  <Plus className="h-3 w-3" /> Add Word
                </button>
              )}
            </div>
            <div className="space-y-2">
              {vocabItems.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input type="text" value={item.japanese} onChange={e => updateVocab(i, 'japanese', e.target.value)} placeholder="Japanese" className={`${inputCls} flex-1`} />
                  <input type="text" value={item.romaji} onChange={e => updateVocab(i, 'romaji', e.target.value)} placeholder="Romaji" className={`${inputCls} flex-1`} />
                  <input type="text" value={item.english} onChange={e => updateVocab(i, 'english', e.target.value)} placeholder="English" className={`${inputCls} flex-1`} />
                  {vocabItems.length > 1 && (
                    <button type="button" onClick={() => removeVocab(i)} className="mt-1.5 p-1 text-dojo-text-muted hover:text-dojo-danger transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Language Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Target Language</label>
              <select value={targetLanguage} onChange={e => setTargetLanguage(e.target.value)} className={inputCls}>
                {TARGET_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.nativeName} ({l.name})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Native Language</label>
              <select value={nativeLanguage} onChange={e => setNativeLanguage(e.target.value)} className={inputCls}>
                {NATIVE_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.nativeName} ({l.name})</option>)}
              </select>
            </div>
          </div>

          {/* AI Avatar */}
          <div>
            <label className={labelCls}>AI Avatar</label>
            <select value={characterId ?? ''} onChange={e => setCharacterId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
              <option value="">Default Assistant</option>
              {characters.map(c => <option key={c.id} value={c.id}>{c.name} — {c.role}</option>)}
            </select>
          </div>

          {/* Skill Level & Difficulty */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Skill Level</label>
              <div className="flex gap-1.5">
                {(['beginner', 'intermediate', 'advanced'] as const).map(level => (
                  <button key={level} type="button" onClick={() => setSkillLevel(level)}
                    className={`flex-1 rounded-[--radius-md] px-3 py-2 text-xs font-medium transition-all capitalize ${
                      skillLevel === level
                        ? 'bg-dojo-accent text-white'
                        : 'border border-dojo-border bg-dojo-surface-raised text-dojo-text-muted hover:text-dojo-text-primary'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Difficulty</label>
              <div className="flex gap-1.5">
                {(['standard', 'trouble'] as const).map(mode => (
                  <button key={mode} type="button" onClick={() => setBehaviorMode(mode)}
                    className={`flex-1 rounded-[--radius-md] px-3 py-2 text-xs font-medium transition-all capitalize ${
                      behaviorMode === mode
                        ? 'bg-dojo-accent text-white'
                        : 'border border-dojo-border bg-dojo-surface-raised text-dojo-text-muted hover:text-dojo-text-primary'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-[--radius-md] border border-dojo-danger/30 bg-dojo-danger/5 px-4 py-2.5 text-sm text-dojo-danger">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button variant="primary" className="flex-1" onClick={handleSubmit} loading={loading}>Create & Start Practice</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
