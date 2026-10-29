ALTER TABLE "hallazgos" ADD COLUMN "umbral" double precision;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN "protege" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "patrones" jsonb DEFAULT '{}'::jsonb NOT NULL;