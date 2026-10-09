CREATE INDEX "idx_chat_messages_room_created" ON "chat_messages" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_session_turn" ON "conversations" USING btree ("session_id","turn_no");--> statement-breakpoint
CREATE INDEX "idx_corrections_conversation" ON "corrections" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_evaluations_user" ON "evaluations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_goal_completions_session" ON "goal_completions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_scenario_goals_scenario_order" ON "scenario_goals" USING btree ("scenario_id","sequence_order");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_started" ON "sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_vocabulary_scenario_lang" ON "vocabulary" USING btree ("scenario_id","language_code");--> statement-breakpoint
CREATE INDEX "idx_vocabulary_encounters_session" ON "vocabulary_encounters" USING btree ("session_id");