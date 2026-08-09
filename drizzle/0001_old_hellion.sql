CREATE TABLE `one_time_expense_actuals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`one_time_expense_id` integer NOT NULL,
	`actual_amount_minor` integer NOT NULL,
	`actual_currency` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`one_time_expense_id`) REFERENCES `one_time_expenses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_expense_actuals_item_unique` ON `one_time_expense_actuals` (`one_time_expense_id`);