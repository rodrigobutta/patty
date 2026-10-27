CREATE TABLE "resumen_semana" (
	"persona_id" integer NOT NULL,
	"semana" date NOT NULL,
	"titulo" text NOT NULL,
	"texto" text NOT NULL,
	"destacados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sugerencias" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"numeros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resumen_semana_persona_id_semana_pk" PRIMARY KEY("persona_id","semana")
);
--> statement-breakpoint
ALTER TABLE "resumen_semana" ADD CONSTRAINT "resumen_semana_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;