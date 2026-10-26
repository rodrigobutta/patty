CREATE TABLE "ajustes" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
