package main

import (
	"flag"

	"github.com/masterkeysrd/saturn/internal/codegen/typescript"
	"google.golang.org/protobuf/compiler/protogen"
	"google.golang.org/protobuf/types/pluginpb"
)

func main() {
	var flags flag.FlagSet
	axiosImportPath := flags.String("axios_import_path", "@lib/axios", "The import path for the axios instance")
	urlPrefix := flags.String("url_prefix", "", "The URL prefix for the generated client methods")

	protogen.Options{
		ParamFunc: flags.Set,
	}.Run(func(gen *protogen.Plugin) error {
		gen.SupportedFeatures = uint64(pluginpb.CodeGeneratorResponse_FEATURE_PROTO3_OPTIONAL)
		for _, f := range gen.Files {
			if f.Generate {
				typescriptgen.GenerateAxios(gen, f, typescriptgen.GenerateAxiosOptions{
					AxiosImportPath: *axiosImportPath,
					URLPrefix:       *urlPrefix,
				})
			}
		}
		return nil
	})
}
