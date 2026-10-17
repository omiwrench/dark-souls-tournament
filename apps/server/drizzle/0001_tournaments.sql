CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ruleset_id` text NOT NULL,
	`seeding` text NOT NULL,
	`bracket` text NOT NULL,
	`created_at` text NOT NULL
);
