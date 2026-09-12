package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/masterkeysrd/saturn/internal/codegen"
)

func main() {
	dirFlag := flag.String("dir", ".", "Directory to scan for annotated interfaces (or use ./...)")
	allFlag := flag.Bool("all", false, "Scan all subdirectories recursively")
	tagFlag := flag.String("tag", "@Mock", "Annotation tag to look for in doc comments")
	outFlag := flag.String("out", "mocks_test.go", "Output filename (saved within each package directory)")
	flag.Parse()

	targetDir := *dirFlag
	isRecursive := *allFlag || targetDir == "./..." || strings.HasSuffix(targetDir, "/...")
	if strings.HasSuffix(targetDir, "/...") {
		targetDir = strings.TrimSuffix(targetDir, "/...")
		if targetDir == "" {
			targetDir = "."
		}
	}

	if isRecursive {
		if err := processRecursive(targetDir, *tagFlag, *outFlag); err != nil {
			fmt.Fprintf(os.Stderr, "Error processing directories: %v\n", err)
			os.Exit(1)
		}
		return
	}

	count, err := processDir(targetDir, *tagFlag, *outFlag)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error processing %s: %v\n", targetDir, err)
		os.Exit(1)
	}

	if count == 0 {
		fmt.Printf("No interfaces annotated with %s found in %s\n", *tagFlag, targetDir)
	}
}

func processDir(dir string, tag string, outName string) (int, error) {
	ifaces, err := codegen.FindInterfacesWithAnnotation(dir, tag)
	if err != nil {
		return 0, err
	}

	if len(ifaces) == 0 {
		return 0, nil
	}

	outPath := filepath.Join(dir, outName)
	file, err := codegen.GenerateMocks(ifaces, outPath)
	if err != nil {
		return 0, fmt.Errorf("generate mocks: %w", err)
	}

	if err := file.Save(); err != nil {
		return 0, fmt.Errorf("save %s: %w", outPath, err)
	}

	var names []string
	for _, iface := range ifaces {
		names = append(names, iface.Name)
	}

	fmt.Printf("Successfully generated %s for %s (in package %s)\n",
		outPath, strings.Join(names, ", "), ifaces[0].PkgName)

	return len(ifaces), nil
}

func processRecursive(root string, tag string, outName string) error {
	totalGenerated := 0

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() {
			return nil
		}

		// Skip irrelevant or non-source directories
		base := info.Name()
		if strings.HasPrefix(base, ".") ||
			base == "node_modules" ||
			base == "vendor" ||
			base == "bin" ||
			base == "dist" ||
			base == "api" ||
			base == "apis" ||
			base == "tests" ||
			base == "deployments" ||
			base == "build" {
			return filepath.SkipDir
		}

		count, err := processDir(path, tag, outName)
		if err != nil {
			// Don't fail the entire walk if a directory simply has no Go packages
			return nil
		}
		totalGenerated += count
		return nil
	})

	if err != nil {
		return err
	}

	fmt.Printf("Finished mockgen scan: generated %d mock interface(s)\n", totalGenerated)
	return nil
}
