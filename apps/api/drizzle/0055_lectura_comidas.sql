CREATE TABLE "lectura_comidas" (
	"persona_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"texto" text NOT NULL,
	"origen" text NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lectura_comidas_persona_id_fecha_pk" PRIMARY KEY("persona_id","fecha")
);
--> statement-breakpoint
ALTER TABLE "lectura_comidas" ADD CONSTRAINT "lectura_comidas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;