CREATE TABLE "resumen_noche" (
	"persona_id" integer NOT NULL,
	"noche" date NOT NULL,
	"texto" text NOT NULL,
	"calidad" integer NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resumen_noche_persona_id_noche_pk" PRIMARY KEY("persona_id","noche")
);
--> statement-breakpoint
ALTER TABLE "resumen_noche" ADD CONSTRAINT "resumen_noche_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;