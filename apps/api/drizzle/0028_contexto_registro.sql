CREATE TABLE "contexto_registro" (
	"registro_id" bigint PRIMARY KEY NOT NULL,
	"persona_id" integer NOT NULL,
	"texto" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contexto_registro" ADD CONSTRAINT "contexto_registro_registro_id_registros_id_fk" FOREIGN KEY ("registro_id") REFERENCES "public"."registros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contexto_registro" ADD CONSTRAINT "contexto_registro_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;