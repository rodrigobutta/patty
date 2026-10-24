ALTER TABLE "personas" ADD COLUMN "sexo" text;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "altura_cm" smallint;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "peso_kg" double precision;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "condiciones" text[] DEFAULT '{}'::text[] NOT NULL;