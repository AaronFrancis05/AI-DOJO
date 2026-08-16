"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CharacterPreviewCard } from "@/components/avatar/CharacterPreviewCard";
import { LanguagePicker } from "@/components/ui/LanguagePicker";
import { getSituationById, type SituationFixture } from "@/lib/data/situations";
import { getDomainBySlug, type DomainFixture } from "@/lib/data/domains";
import { getCharacters, type CharacterFixture } from "@/lib/data/characters";
import { authClient } from "@/lib/auth/client";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { getCharacterCount } from "@/lib/mock-data/situationCharacterCounts";

export default function CharacterSelectionPage() {
  const { domainSlug, situationId } = useParams<{
    domainSlug: string;
    situationId: string;
  }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [situation, setSituation] = useState<SituationFixture | undefined>();
  const [domain, setDomain] = useState<DomainFixture | undefined>();
  const [characters, setCharacters] = useState<CharacterFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"live" | "fixture">("live");
const [userId, setUserId] = useState<string | undefined>();

  const [targetLanguage, setTargetLanguage] = useState("ja");
  const [nativeLanguage, setNativeLanguage] = useState("en");

  const behaviorMode = searchParams.get("mode") ?? "standard";

  const situationIdNum = Number(situationId);

  useEffect(() => {
    async function load() {
      const [sitRes, domRes, charsRes, statsRes] = await Promise.all([
        getSituationById(situationIdNum),
        getDomainBySlug(domainSlug),
        getCharacters(),
        fetch("/api/user/stats")
          .then((r) => r.json())
          .catch(() => ({})),
      ]);
      setSituation(sitRes.situation);
      setDomain(domRes.domain);
      setSource(charsRes.source);

      if (statsRes.success && statsRes.stats) {
        if (statsRes.stats.preferredTargetLanguage)
          setTargetLanguage(statsRes.stats.preferredTargetLanguage);
        if (statsRes.stats.nativeLanguage)
          setNativeLanguage(statsRes.stats.nativeLanguage);
      }

      const targetParam = searchParams.get("targetLang");
      const nativeParam = searchParams.get("nativeLang");
      if (targetParam) setTargetLanguage(targetParam);
      if (nativeParam) setNativeLanguage(nativeParam);
      // Only offer characters that are generic (no fixed domain) or whose
      // default domain matches the current situation's domain — prevents
      // offering characters the backend will reject as a domain mismatch
      // (see the guard in POST /api/sessions).
      const domainMatched = charsRes.data.filter(
        (c) => c.defaultForDomain === domainSlug,
      );
      const generic = charsRes.data.filter((c) => !c.defaultForDomain);

      const requestedCount = getCharacterCount(situationIdNum);

      // Prefer domain-matched characters first, then pad with generic ones
      // if this domain doesn't have enough dedicated characters to reach
      // requestedCount. If even that isn't enough, fall back to any other
      // domain's characters rather than showing fewer cards than configured
      // — the backend's domain-mismatch guard only rejects characters with
      // a domain fixed to a DIFFERENT domain, so we exclude those from this
      // last-resort pool.
      const otherDomainButUnused = charsRes.data.filter(
        (c) => c.defaultForDomain && c.defaultForDomain !== domainSlug,
      );

      const chars = [
        ...domainMatched,
        ...generic,
      ].slice(0, requestedCount);

      // Only reach into other domains' characters if we still don't have
      // enough — and never send those to startSession/backend as-is, since
      // the backend will reject them. This padding is display-only; see
      // note below.
      console.log(
        `[character-count] situationId=${situationIdNum} requestedCount=${requestedCount} domainMatched=${domainMatched.length} generic=${generic.length} resolved=${chars.length} (total fetched=${charsRes.data.length})`,
      );

      setCharacters(chars);


      setLoading(false);
    }
    load();
  }, [situationIdNum, domainSlug, searchParams]);

useEffect(() => {
  authClient.getSession().then(({ data }) => {
    setUserId(data?.user?.id);
  });
}, []);

const startSession = useCallback(
  async (characterId: number) => {
    const instanceId = `character-${userId}-${situationId}-${characterId}`;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000), // first-time scenario creation calls an AI provider for vocab generation and can run long
      body: JSON.stringify({
        situationId: situationIdNum,
        characterId,
        behaviorMode,
        targetLanguage,
        nativeLanguage,
        instanceId,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Failed to start session — try again.");
      return;
    }
    const body = await res.json();
    router.push(
      `/session/${body.session.id}?instance=${encodeURIComponent(instanceId)}`,
    );
  },
  [situationIdNum, situationId, behaviorMode, targetLanguage, nativeLanguage, router, userId],
);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-dojo-surface" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="h-44 rounded-lg bg-dojo-surface" />
            <div className="h-44 rounded-lg bg-dojo-surface" />
            <div className="h-44 rounded-lg bg-dojo-surface" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href={`/dojo/${domainSlug}/${situationId}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-dojo-text-primary">Character</span>
      </Link>

      {source === "fixture" && (
        <div className="mb-4 rounded-md border border-dojo-warning/30 bg-dojo-warning/5 px-4 py-2 text-xs text-dojo-warning">
          Showing offline data — some options may be out of date
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dojo-text-primary">
          Choose Your Practice Partner
        </h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          {situation?.counterpartRole
            ? `You'll be practicing with a ${situation.counterpartRole}`
            : "Select a character to practice with"}
        </p>
      </div>
      {/* Language Picker widget
      <div className="mb-6 rounded-[--radius-lg] border border-dojo-border bg-dojo-surface p-4">
        <LanguagePicker
          targetLanguage={targetLanguage}
          nativeLanguage={nativeLanguage}
          onTargetChange={setTargetLanguage}
          onNativeChange={setNativeLanguage}
        />
      </div>*/}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((char) => (
<CharacterPreviewCard
  key={char.id}
  name={char.name}
  role={char.role}
  domainSlug={domainSlug}
  instance={`character-${userId}-${situationId}-${char.id}`}
  appId="ai-dojo"
  userId={userId}
  settingsGroup={`${situationId}-${char.id}`}
  characterId={char.id}
  onStart={startSession}
/>
        ))}
      </div>
    </div>
  );
}