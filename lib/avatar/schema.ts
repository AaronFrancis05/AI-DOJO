import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    characterName: varchar("character_name", { length: 255 }),
    role: varchar("role", { length: 16 }).notNull(),
    content: text("content").notNull().default(""),
    text: text("text"),
    textEn: text("text_en"),
    textJa: text("text_ja"),
    time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("chat_messages_user_id_idx").on(table.userId),
    characterNameIdx: index("chat_messages_character_name_idx").on(
      table.characterName
    ),
  })
);

export const userSettings = pgTable('user_settings', {
  userId: varchar('user_id', { length: 255 }).primaryKey(),
  uiLanguage: varchar('ui_language', { length: 16 }).default('en'),
  responseLanguage: varchar('response_language', { length: 16 }).default('ja'),
  lastAvatar: varchar('last_avatar', { length: 255 }),
  personaOverrides: text('persona_overrides'),
});
export const appSettings = pgTable('app_settings', {
  appId: varchar('app_id', { length: 255 }).notNull(),
  settingsGroup: varchar('settings_group', { length: 255 }).notNull().default(''),
  uiLanguage: varchar('ui_language', { length: 16 }).default('en'),
  responseLanguage: varchar('response_language', { length: 16 }).default('ja'),
  lastAvatar: varchar('last_avatar', { length: 255 }),
  personaOverrides: text('persona_overrides'),
}, (table) => ({
  pk: primaryKey({ columns: [table.appId, table.settingsGroup] }),
}));

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;