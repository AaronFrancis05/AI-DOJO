# Project Memory

## 2026-08-16

- AI DOJO voice chat: fixed "Objects are not valid as a React child" by rendering `goal.goalText` instead of `{goal}` and comparing `goal.sequenceOrder` instead of the full object in `voice/page.tsx`.
- Deleted remote branch `origin/dev2` (`git push origin --delete dev2`).
- Voice UI polish: orb volume meter, status pill, token-based light/dark colors, real `skillLevel` and `userCharacterRole`, functional chat filter tabs (All/Key Phrases/Notes), suggested replies replaced dead buttons.
- Conversation chat moved OUT of the central stage (orb + mic area) into a left slide-out panel toggled by the "Show Chat" button; caption bubble removed from `VoiceOnlyStage.tsx`.
- `/remember`, `/recover`, and `/agents/remember` are not built-in opencode commands; created a custom `remember` subagent at `~/.config/opencode/agents/remember.md` so `/agents/remember <note>` saves to `MEMORY.md`.
- Working repo: `C:\Users\ARON\Desktop\ai_dojo\AI-DOJO`, branch `dev`.