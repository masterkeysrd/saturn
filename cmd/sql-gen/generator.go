package main

import (
	"flag"
	"log"
	"os"

	sqlgen "github.com/masterkeysrd/saturn/internal/codegen/sql"
	"github.com/masterkeysrd/saturn/internal/storage/pg"
)

func main() {
	var flags flag.FlagSet

	var config sqlgen.Config
	flags.StringVar(&config.Package, "package", "models", "The package name for the generated code")
	flags.StringVar(&config.Schema, "schema", "public", "The database schema to generate models for")
	flags.StringVar(&config.ModelSuffix, "model-suffix", "", "The suffix to append to generated model struct names")
	flags.StringVar(&config.FilePath, "destination", "models-gen.go", "The file path to write the generated code to")
	flags.StringVar(&config.QueryPath, "queries", "queries.sql", "The file path to read SQL queries from")
	flags.Parse(os.Args[1:])

	db, err := pg.NewDefaultConnection()
	if err != nil {
		log.Fatal("failed to connect to database:", err)
	}

	if err := sqlgen.Generate(config, db); err != nil {
		log.Fatal("failed to generate models:", err)
	}
}
