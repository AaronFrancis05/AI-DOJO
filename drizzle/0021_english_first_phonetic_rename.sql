ALTER TABLE "conversations" RENAME COLUMN "message_romaji" TO "message_phonetic";
ALTER TABLE "corrections" RENAME COLUMN "original_romaji" TO "original_phonetic";
ALTER TABLE "corrections" RENAME COLUMN "corrected_romaji" TO "corrected_phonetic";
ALTER TABLE "vocabulary" RENAME COLUMN "romaji" TO "phonetic";
