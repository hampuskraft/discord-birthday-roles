DROP TABLE IF EXISTS birthdays;
CREATE TABLE birthdays (
    user_id TEXT NOT NULL,
    birthday_month INTEGER NOT NULL,
    birthday_day INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id)
);
