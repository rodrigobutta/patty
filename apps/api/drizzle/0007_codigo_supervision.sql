CREATE TABLE "codigos_supervision" (
	"codigo" text PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"vence" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "codigos_supervision" ADD CONSTRAINT "codigos_supervision_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;