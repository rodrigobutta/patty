DROP INDEX "hallazgos_par_idx";--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN "causas_extra" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN "combo" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "hallazgos_par_idx" ON "hallazgos" USING btree ("persona_id","causa_id","causa_modo","combo","efecto_id","efecto_modo","desfase_dias");