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
)

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

func main() {
	var (
		coverProfile string
		minThreshold float64
		summaryFile  string
	)

	flag.StringVar(&coverProfile, "coverprofile", "coverage/coverage.out", "Path to coverage profile file")
	flag.StringVar(&summaryFile, "summary", os.Getenv("GITHUB_STEP_SUMMARY"), "Path to write markdown summary (defaults to $GITHUB_STEP_SUMMARY)")
	flag.Float64Var(&minThreshold, "min", 0.0, "Minimum overall coverage percentage required")
	flag.Parse()

	f, err := os.Open(coverProfile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "covercheck: failed to open profile: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = f.Close() }()

	packages := make(map[string]*pkgStats)
	var totalStmts, totalCovered int64

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "mode:") {
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
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "covercheck: error reading profile: %v\n", err)
		os.Exit(1)
	}

	if totalStmts == 0 {
		fmt.Println("covercheck: no statements found in coverage profile")
		os.Exit(0)
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
		shortPkg := strings.TrimPrefix(s.pkg, "github.com/masterkeysrd/saturn/")
		fmt.Printf("%-65s %10d %10d %9.1f%%\n", shortPkg, s.covered, s.total, s.percent())
	}
	fmt.Println(strings.Repeat("-", 99))
	fmt.Printf("%-65s %10d %10d %9.1f%%\n", "TOTAL", totalCovered, totalStmts, overallPercent)
	fmt.Println()

	// Write GitHub step summary if configured
	if summaryFile != "" {
		writeGitHubSummary(summaryFile, overallPercent, minThreshold, pkgList, totalCovered, totalStmts)
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

func writeGitHubSummary(path string, overall float64, min float64, pkgs []*pkgStats, totalCovered, totalStmts int64) {
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
		shortPkg := strings.TrimPrefix(p.pkg, "github.com/masterkeysrd/saturn/")
		sb.WriteString(fmt.Sprintf("| %s | `%s` | **%.1f%%** | %d / %d |\n", badge(p.percent()), shortPkg, p.percent(), p.covered, p.total))
	}
	sb.WriteString(fmt.Sprintf("| %s | **Total** | **%.1f%%** | **%d / %d** |\n", badge(overall), overall, totalCovered, totalStmts))

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		defer func() { _ = f.Close() }()
		_, _ = f.WriteString(sb.String())
	}
}
