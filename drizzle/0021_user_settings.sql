CREATE TABLE "user_settings" (
    "user_id" varchar(255) PRIMARY KEY NOT NULL,
    "ui_language" varchar(8) DEFAULT 'en',
    "response_language" varchar(8) DEFAULT 'ja',
    "last_avatar" varchar(255)
);
