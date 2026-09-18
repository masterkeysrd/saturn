package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"go.yaml.in/yaml/v3"
)

type Config struct {
	MinCoverage   float64  `yaml:"min_coverage"`
	CoverProfile  string   `yaml:"coverprofile"`
	SummaryFile   string   `yaml:"summary"`
	FilterProfile *bool    `yaml:"filter_profile"`
	Exclude       []string `yaml:"exclude"`
}

type pkgStats struct {
	pkg     string
	total   int64
	covered int64
}

func (s *pkgStats) percent() float64 {
	if s.total == 0 {
		return 100.0
	}
	return (float64(s.covered) / float64(s.total)) * 100.0
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}
	return &cfg, nil
}

func detectModulePrefix() string {
	data, err := os.ReadFile("go.mod")
	if err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if strings.HasPrefix(line, "module ") {
				mod := strings.TrimSpace(strings.TrimPrefix(line, "module"))
				return strings.TrimSuffix(mod, "/") + "/"
			}
		}
	}
	return "github.com/masterkeysrd/saturn/"
}

func isExcluded(relFile, relPkg string, patterns []string) bool {
	relFile = filepath.ToSlash(relFile)
	relPkg = filepath.ToSlash(relPkg)
	baseFile := filepath.Base(relFile)

	for _, pattern := range patterns {
		pattern = filepath.ToSlash(strings.TrimSpace(pattern))
		if pattern == "" {
			continue
		}

		// Exact match against package or file
		if relPkg == pattern || relFile == pattern {
			return true
		}

		// Directory / prefix glob, e.g. "apis/**" or "apis/*" or "apis/"
		if strings.HasSuffix(pattern, "/**") {
			prefix := strings.TrimSuffix(pattern, "/**")
			if relPkg == prefix || strings.HasPrefix(relPkg, prefix+"/") ||
				relFile == prefix || strings.HasPrefix(relFile, prefix+"/") {
				return true
			}
		} else if strings.HasSuffix(pattern, "/*") {
			prefix := strings.TrimSuffix(pattern, "/*")
			if relPkg == prefix || filepath.Dir(relFile) == prefix || filepath.Dir(relPkg) == prefix {
				return true
			}
		} else if strings.HasSuffix(pattern, "/") {
			prefix := strings.TrimSuffix(pattern, "/")
			if relPkg == prefix || strings.HasPrefix(relPkg, prefix+"/") ||
				relFile == prefix || strings.HasPrefix(relFile, prefix+"/") {
				return true
			}
		}

		// Glob match against file, package, or base filename (e.g. *.pb.go)
		if matched, _ := filepath.Match(pattern, relFile); matched {
			return true
		}
		if matched, _ := filepath.Match(pattern, relPkg); matched {
			return true
		}
		if matched, _ := filepath.Match(pattern, baseFile); matched {
			return true
		}
	}
	return false
}

func main() {
	var (
		configFile   string
		coverProfile string
		minThreshold float64
		summaryFile  string
		filterFlag   bool
	)

	flag.StringVar(&configFile, "config", ".covercheck.yaml", "Path to configuration file")
	flag.StringVar(&coverProfile, "coverprofile", "", "Path to coverage profile file (overrides config)")
	flag.StringVar(&summaryFile, "summary", "", "Path to write markdown summary (overrides config)")
	flag.Float64Var(&minThreshold, "min", -1.0, "Minimum overall coverage percentage required (overrides config)")
	flag.BoolVar(&filterFlag, "filter", true, "Rewrite coverage profile with excluded entries removed")
	flag.Parse()

	flagsSet := make(map[string]bool)
	flag.Visit(func(f *flag.Flag) {
		flagsSet[f.Name] = true
	})

	cfg := &Config{}
	if configFile != "" {
		if _, err := os.Stat(configFile); err == nil {
			loaded, err := loadConfig(configFile)
			if err != nil {
				fmt.Fprintf(os.Stderr, "covercheck: %v\n", err)
				os.Exit(1)
			}
			cfg = loaded
		} else if flagsSet["config"] {
			fmt.Fprintf(os.Stderr, "covercheck: config file not found: %s\n", configFile)
			os.Exit(1)
		}
	}

	// Apply configuration with CLI flag overrides
	if !flagsSet["coverprofile"] {
		if cfg.CoverProfile != "" {
			coverProfile = cfg.CoverProfile
		} else {
			coverProfile = "coverage/coverage.out"
		}
	}
	if !flagsSet["min"] {
		if cfg.MinCoverage > 0 {
			minThreshold = cfg.MinCoverage
		} else {
			minThreshold = 0.0
		}
	}
	if !flagsSet["summary"] {
		if cfg.SummaryFile != "" {
			summaryFile = cfg.SummaryFile
		} else {
			summaryFile = os.Getenv("GITHUB_STEP_SUMMARY")
		}
	}
	if !flagsSet["filter"] && cfg.FilterProfile != nil {
		filterFlag = *cfg.FilterProfile
	}

	f, err := os.Open(coverProfile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "covercheck: failed to open profile: %v\n", err)
		os.Exit(1)
	}

	packages := make(map[string]*pkgStats)
	var totalStmts, totalCovered int64
	var header string
	var filteredLines []string
	modulePrefix := detectModulePrefix()

	scanner := bufio.NewScanner(f)
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "mode:") {
			header = line
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}

		colonIdx := strings.LastIndex(fields[0], ":")
		if colonIdx == -1 {
			continue
		}
		filePath := fields[0][:colonIdx]
		pkgPath := filepath.Dir(filePath)

		relFilePath := strings.TrimPrefix(filePath, modulePrefix)
		relPkgPath := strings.TrimPrefix(pkgPath, modulePrefix)

		if isExcluded(relFilePath, relPkgPath, cfg.Exclude) {
			continue
		}

		stmts, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}
		count, err := strconv.ParseInt(fields[2], 10, 64)
		if err != nil {
			continue
		}

		stats, ok := packages[pkgPath]
		if !ok {
			stats = &pkgStats{pkg: pkgPath}
			packages[pkgPath] = stats
		}

		stats.total += stmts
		totalStmts += stmts
		if count > 0 {
			stats.covered += stmts
			totalCovered += stmts
		}

		filteredLines = append(filteredLines, line)
	}

	if err := scanner.Err(); err != nil {
		_ = f.Close()
		fmt.Fprintf(os.Stderr, "covercheck: error reading profile: %v\n", err)
		os.Exit(1)
	}
	_ = f.Close()

	if totalStmts == 0 {
		fmt.Println("covercheck: no statements found in coverage profile")
		os.Exit(0)
	}

	// Rewrite coverage profile if filter is enabled
	if filterFlag && header != "" && len(filteredLines) > 0 {
		var sb strings.Builder
		sb.WriteString(header + "\n")
		for _, l := range filteredLines {
			sb.WriteString(l + "\n")
		}
		if err := os.WriteFile(coverProfile, []byte(sb.String()), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "covercheck: warning: failed to write filtered profile: %v\n", err)
		}
	}

	var overallPercent float64
	if totalStmts > 0 {
		overallPercent = (float64(totalCovered) / float64(totalStmts)) * 100.0
	}

	// Sort packages alphabetically
	var pkgList []*pkgStats
	for _, stats := range packages {
		pkgList = append(pkgList, stats)
	}
	sort.Slice(pkgList, func(i, j int) bool {
		return pkgList[i].pkg < pkgList[j].pkg
	})

	// Print terminal report
	fmt.Println()
	fmt.Printf("%-65s %10s %10s %10s\n", "Package", "Covered", "Total", "Coverage")
	fmt.Println(strings.Repeat("-", 99))
	for _, s := range pkgList {
		shortPkg := strings.TrimPrefix(s.pkg, modulePrefix)
		fmt.Printf("%-65s %10d %10d %9.1f%%\n", shortPkg, s.covered, s.total, s.percent())
	}
	fmt.Println(strings.Repeat("-", 99))
	fmt.Printf("%-65s %10d %10d %9.1f%%\n", "TOTAL", totalCovered, totalStmts, overallPercent)
	fmt.Println()

	// Write GitHub step summary if configured
	if summaryFile != "" {
		writeGitHubSummary(summaryFile, overallPercent, minThreshold, pkgList, totalCovered, totalStmts, modulePrefix)
	}

	// Enforce threshold
	if minThreshold > 0 && overallPercent < minThreshold {
		fmt.Fprintf(os.Stderr, "❌ Coverage check failed: overall coverage %.2f%% is below minimum required %.2f%%\n", overallPercent, minThreshold)
		os.Exit(1)
	}

	if minThreshold > 0 {
		fmt.Printf("✅ Coverage check passed: overall coverage %.2f%% meets minimum requirement of %.2f%%\n", overallPercent, minThreshold)
	}
}

func badge(pct float64) string {
	if pct >= 70.0 {
		return "🟢"
	} else if pct >= 40.0 {
		return "🟡"
	}
	return "🔴"
}

func writeGitHubSummary(path string, overall float64, min float64, pkgs []*pkgStats, totalCovered, totalStmts int64, modulePrefix string) {
	var sb strings.Builder
	sb.WriteString("## 🧪 Code Coverage Report\n\n")

	status := "✅ **Passed**"
	if min > 0 && overall < min {
		status = "❌ **Failed**"
	}

	sb.WriteString(fmt.Sprintf("- **Overall Coverage**: %.2f%% %s\n", overall, badge(overall)))
	if min > 0 {
		sb.WriteString(fmt.Sprintf("- **Minimum Required**: %.2f%%\n", min))
		sb.WriteString(fmt.Sprintf("- **Status**: %s\n", status))
	}
	sb.WriteString(fmt.Sprintf("- **Statements**: %d / %d\n\n", totalCovered, totalStmts))

	sb.WriteString("| Status | Package | Coverage | Statements |\n")
	sb.WriteString("| :---: | :--- | :---: | :---: |\n")
	for _, p := range pkgs {
		shortPkg := strings.TrimPrefix(p.pkg, modulePrefix)
		sb.WriteString(fmt.Sprintf("| %s | `%s` | **%.1f%%** | %d / %d |\n", badge(p.percent()), shortPkg, p.percent(), p.covered, p.total))
	}
	sb.WriteString(fmt.Sprintf("| %s | **Total** | **%.1f%%** | **%d / %d** |\n", badge(overall), overall, totalCovered, totalStmts))

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		defer func() { _ = f.Close() }()
		_, _ = f.WriteString(sb.String())
	}
}
