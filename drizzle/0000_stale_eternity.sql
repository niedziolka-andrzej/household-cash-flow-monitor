CREATE TABLE `income_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`forecast_amount_minor` integer NOT NULL,
	`forecast_currency` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `investment_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`total_target_amount_minor` integer NOT NULL,
	`total_target_currency` text NOT NULL,
	`monthly_minimum_amount_minor` integer NOT NULL,
	`monthly_minimum_currency` text NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "investment_configs_range_check" CHECK("investment_configs"."end_month" >= "investment_configs"."start_month")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `investment_configs_plan_id_unique` ON `investment_configs` (`plan_id`);--> statement-breakpoint
CREATE TABLE `monthly_actuals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`month` text NOT NULL,
	`income_actual_amount_minor` integer,
	`income_actual_currency` text,
	`one_time_expense_actual_amount_minor` integer,
	`one_time_expense_actual_currency` text,
	`investment_actual_amount_minor` integer,
	`investment_actual_currency` text,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_actuals_plan_month_unique` ON `monthly_actuals` (`plan_id`,`month`);--> statement-breakpoint
CREATE TABLE `monthly_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`month` text NOT NULL,
	`override_balance_amount_minor` integer NOT NULL,
	`override_balance_currency` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_overrides_plan_month_unique` ON `monthly_overrides` (`plan_id`,`month`);--> statement-breakpoint
CREATE TABLE `one_time_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`forecast_amount_minor` integer NOT NULL,
	`forecast_currency` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text NOT NULL,
	`currency` text DEFAULT 'PLN' NOT NULL,
	`opening_balance_amount_minor` integer DEFAULT 0 NOT NULL,
	`opening_balance_currency` text DEFAULT 'PLN' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "plans_range_check" CHECK("plans"."end_month" >= "plans"."start_month")
);
--> statement-breakpoint
CREATE TABLE `recurring_expense_actuals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`recurring_expense_id` integer NOT NULL,
	`month` text NOT NULL,
	`actual_amount_minor` integer NOT NULL,
	`actual_currency` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recurring_expense_id`) REFERENCES `recurring_expenses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_expense_actuals_item_month_unique` ON `recurring_expense_actuals` (`recurring_expense_id`,`month`);--> statement-breakpoint
CREATE TABLE `recurring_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`name` text NOT NULL,
	`monthly_amount_minor` integer NOT NULL,
	`monthly_currency` text NOT NULL,
	`start_month` text,
	`end_month` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
