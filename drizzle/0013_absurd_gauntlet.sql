ALTER TABLE "users" RENAME COLUMN "theme" TO "interface_mode";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_theme_valid";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "interface_mode" SET DEFAULT 'LEGACY';--> statement-breakpoint
UPDATE "users" SET "interface_mode" = 'LEGACY';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_interface_mode_valid" CHECK ("users"."interface_mode" IN ('LEGACY', 'MODERN'));
