CREATE TABLE "gente" (
	"persona_id" integer NOT NULL,
	"concepto_id" integer NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gente_persona_id_concepto_id_pk" PRIMARY KEY("persona_id","concepto_id")
);
--> statement-breakpoint
ALTER TABLE "gente" ADD CONSTRAINT "gente_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gente" ADD CONSTRAINT "gente_concepto_id_conceptos_id_fk" FOREIGN KEY ("concepto_id") REFERENCES "public"."conceptos"("id") ON DELETE cascade ON UPDATE no action;