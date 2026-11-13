ALTER TABLE "media_assets" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "byte_size" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "uploaded_by" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_uq" ON "media_assets" USING btree ("storage_key");--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_byte_size_chk" CHECK ("media_assets"."byte_size" IS NULL OR "media_assets"."byte_size" BETWEEN 1 AND 10485760);