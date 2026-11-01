ALTER TABLE "personas" ADD COLUMN "alergias" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "estados_puntuales" jsonb DEFAULT '{}'::jsonb NOT NULL;