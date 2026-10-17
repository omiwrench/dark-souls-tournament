CREATE TABLE `match_events` (
	`match_id` text NOT NULL,
	`seq` integer NOT NULL,
	`at` text NOT NULL,
	`match_time_ms` integer NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`match_id`, `seq`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text,
	`bracket_node_id` text,
	`player1_id` text NOT NULL,
	`player2_id` text NOT NULL,
	`player_setup` text NOT NULL,
	`ruleset_id` text,
	`ruleset_snapshot` text NOT NULL,
	`status` text NOT NULL,
	`winner_slot` integer,
	`score1` integer DEFAULT 0 NOT NULL,
	`score2` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`player1_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`player2_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `matches_status_idx` ON `matches` (`status`);--> statement-breakpoint
CREATE INDEX `matches_tournament_idx` ON `matches` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rulesets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`definition` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
