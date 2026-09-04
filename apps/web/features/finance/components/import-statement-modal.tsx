import { useState, useRef, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  type Account,
  type IngestStatementDocumentResponse,
  useImportStatementMutation,
  useIngestStatementDocumentMutation,
} from "@/gen/saturn/finance/v1/finance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AmountInput } from "@/components/ui/amount-input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  UploadCloud,
  Loader2,
  FileSpreadsheet,
  Calendar,
  FileText,
  DollarSign,
  Hash,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Calculator,
  RefreshCw,
  Lock,
  AlertTriangle,
  Layers,
} from "lucide-react"
import { AccountSelect } from "./account-select"
import { formatAmount } from "../utils"
import { cn } from "@/lib/utils"

export interface ImportStatementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: Account[]
  preselectedAccountId?: string | null
  onImportSuccess: (statementId: string) => void
}

function parseCSVLineByLine(text: string, delimiter: string = ","): string[][] {
  const lines: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(cell.trim())
      cell = ""
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      row.push(cell.trim())
      cell = ""
      if (row.length > 0 && row.some((c) => c !== "")) {
        lines.push(row)
      }
      row = []
      if (char === "\r" && nextChar === "\n") {
        i++ // skip \n
      }
    } else {
      cell += char
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.trim())
    if (row.some((c) => c !== "")) {
      lines.push(row)
    }
  }

  return lines
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const len = bytes.byteLength
  const chunkSize = 8192
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len))
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }
  return btoa(binary)
}

export function ImportStatementModal({
  open,
  onOpenChange,
  accounts,
  preselectedAccountId,
  onImportSuccess,
}: ImportStatementModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [importAccountId, setImportAccountId] = useState<string>(
    preselectedAccountId || accounts[0]?.id || ""
  )
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [rawCsvText, setRawCsvText] = useState<string>("")
  const [parsedRows, setParsedRows] = useState<string[][]>([])
  const [hasHeader, setHasHeader] = useState<boolean>(true)
  const [isSeparateDebitCredit, setIsSeparateDebitCredit] =
    useState<boolean>(false)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Smart PDF Ingestion state
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfBase64, setPdfBase64] = useState<string>("")
  const [pdfPassword, setPdfPassword] = useState<string>("")
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [needsPassword, setNeedsPassword] = useState<boolean>(false)
  const [multiCurrencyResult, setMultiCurrencyResult] =
    useState<IngestStatementDocumentResponse | null>(null)

  const ingestDocMutation = useIngestStatementDocumentMutation()

  // Balances
  const [startingBalanceStr, setStartingBalanceStr] = useState<string>("0.00")
  const [endingBalanceStr, setEndingBalanceStr] = useState<string>("0.00")
  const [statementDateStr, setStatementDateStr] = useState<string>(
    new Date().toISOString().split("T")[0]
  )

  // Column Mappings (0-based indices in backend schema)
  const [dateColIndex, setDateColIndex] = useState<number>(0)
  const [descColIndex, setDescColIndex] = useState<number>(1)
  const [amountColIndex, setAmountColIndex] = useState<number>(2)
  const [debitColIndex, setDebitColIndex] = useState<number>(2)
  const [creditColIndex, setCreditColIndex] = useState<number>(3)
  const [refColIndex, setRefColIndex] = useState<number>(-1) // -1 for none

  const queryClient = useQueryClient()
  const importMutation = useImportStatementMutation()

  const resetForm = () => {
    setStep(1)
    setPdfFile(null)
    setPdfBase64("")
    setPdfPassword("")
    setPdfError(null)
    setNeedsPassword(false)
    setMultiCurrencyResult(null)
  }

  const handleModalOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  const targetAccount = useMemo(
    () => accounts.find((a) => a.id === importAccountId),
    [accounts, importAccountId]
  )

  const handleProcessFile = (file: File) => {
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")

    if (isPdf) {
      setPdfFile(file)
      setCsvFile(null)
      setPdfError(null)
      setNeedsPassword(false)
      setMultiCurrencyResult(null)
      fileToBase64(file).then((b64) => setPdfBase64(b64))
      return
    }

    setPdfFile(null)
    setMultiCurrencyResult(null)
    setCsvFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) || ""
      setRawCsvText(text)
      const rows = parseCSVLineByLine(text)
      setParsedRows(rows)

      // Auto-detect columns from header (0-based indices)
      if (rows.length > 0) {
        const headerRow = rows[0].map((h) => h.toLowerCase())
        let detectedDebit = false
        let detectedCredit = false

        headerRow.forEach((colName, idx) => {
          if (colName.includes("date") || colName.includes("fecha")) {
            setDateColIndex(idx)
          } else if (
            colName.includes("desc") ||
            colName.includes("memo") ||
            colName.includes("payee") ||
            colName.includes("detalle") ||
            colName.includes("narrative") ||
            colName.includes("concept")
          ) {
            setDescColIndex(idx)
          } else if (
            colName.includes("debit") ||
            colName.includes("cargo") ||
            colName.includes("gasto") ||
            colName.includes("withdrawal")
          ) {
            setDebitColIndex(idx)
            detectedDebit = true
          } else if (
            colName.includes("credit") ||
            colName.includes("abono") ||
            colName.includes("ingreso") ||
            colName.includes("deposit")
          ) {
            setCreditColIndex(idx)
            detectedCredit = true
          } else if (
            colName.includes("amount") ||
            colName.includes("monto") ||
            colName.includes("importe") ||
            colName.includes("total")
          ) {
            setAmountColIndex(idx)
          } else if (
            colName.includes("ref") ||
            colName.includes("id") ||
            colName.includes("num") ||
            colName.includes("check")
          ) {
            setRefColIndex(idx)
          }
        })

        if (detectedDebit && detectedCredit) {
          setIsSeparateDebitCredit(true)
        }
      }
    }
    reader.readAsText(file)
  }

  // Calculate estimated net flow from the parsed CSV using 0-based indexing
  const estimatedNetFlowCents = useMemo(() => {
    if (parsedRows.length === 0) return null
    const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows
    let totalCents = 0
    let parsedCount = 0

    for (const row of dataRows) {
      if (isSeparateDebitCredit) {
        const debitStr = (row[debitColIndex] || "").replace(/[^0-9.-]/g, "")
        const creditStr = (row[creditColIndex] || "").replace(/[^0-9.-]/g, "")
        const debit = parseFloat(debitStr)
        const credit = parseFloat(creditStr)
        if (!isNaN(debit) && debit > 0) {
          totalCents -= Math.round(debit * 100)
          parsedCount++
        }
        if (!isNaN(credit) && credit > 0) {
          totalCents += Math.round(credit * 100)
          parsedCount++
        }
      } else {
        const amtStr = (row[amountColIndex] || "").replace(/[^0-9.-]/g, "")
        const amt = parseFloat(amtStr)
        if (!isNaN(amt)) {
          totalCents += Math.round(amt * 100)
          parsedCount++
        }
      }
    }
    return parsedCount > 0 ? totalCents : null
  }, [
    parsedRows,
    hasHeader,
    isSeparateDebitCredit,
    amountColIndex,
    debitColIndex,
    creditColIndex,
  ])

  const handleAutoCalculateEndingBalance = () => {
    if (estimatedNetFlowCents === null) return
    const startCents = Math.round(parseFloat(startingBalanceStr || "0") * 100)
    const endCents = startCents + estimatedNetFlowCents
    setEndingBalanceStr((endCents / 100).toFixed(2))
  }

  const handleIngestPdf = async (passwordOverride?: string) => {
    if (!pdfFile || !pdfBase64) return
    setPdfError(null)

    try {
      const res = await ingestDocMutation.mutateAsync({
        filename: pdfFile.name,
        contentType: pdfFile.type || "application/pdf",
        documentBytes: pdfBase64,
        password:
          passwordOverride !== undefined ? passwordOverride : pdfPassword,
        targetAccountId: undefined,
      })

      if (res.needsPassword) {
        setNeedsPassword(true)
        return
      }

      if (res.errors && res.errors.length > 0) {
        setPdfError(res.errors.join(". "))
        return
      }

      if (res.createdStatements && res.createdStatements.length > 0) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/v1/finance/statements"],
        })
        if (res.createdStatements.length === 1) {
          handleModalOpenChange(false)
          onImportSuccess(res.createdStatements[0].id || "")
        } else {
          setMultiCurrencyResult(res)
        }
      } else {
        setPdfError("No statements could be extracted from this document.")
      }
    } catch (err) {
      setPdfError(
        err instanceof Error
          ? err.message
          : "Failed to ingest statement document"
      )
    }
  }

  const handleImport = async () => {
    if (!importAccountId || !csvFile) return

    const startingCents = Math.round(
      parseFloat(startingBalanceStr || "0") * 100
    )
    const endingCents = Math.round(parseFloat(endingBalanceStr || "0") * 100)

    try {
      const res = await importMutation.mutateAsync({
        account_id: importAccountId,
        req: {
          accountId: importAccountId,
          statement: {
            statementDate: statementDateStr,
            statementStartingBalance: String(startingCents),
            statementEndingBalance: String(endingCents),
            filename: csvFile.name,
            rawContent: rawCsvText,
            config: {
              csv: {
                hasHeader,
                dateFormat: "YYYY-MM-DD",
                delimiter: ",",
                dateColumnIndex: dateColIndex,
                descriptionColumnIndex: descColIndex,
                amountColumnIndex: isSeparateDebitCredit ? -1 : amountColIndex,
                debitColumnIndex: isSeparateDebitCredit ? debitColIndex : -1,
                creditColumnIndex: isSeparateDebitCredit ? creditColIndex : -1,
                referenceColumnIndex: refColIndex,
              },
            },
          },
        },
      })

      const stmtId = res?.id
      if (stmtId) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/v1/finance/statements"],
        })
        handleModalOpenChange(false)
        onImportSuccess(stmtId)
      }
    } catch (err) {
      console.error("Statement import failed:", err)
    }
  }

  const maxColumns = parsedRows[0]?.length || 0
  const dataRowsCount = hasHeader
    ? Math.max(0, parsedRows.length - 1)
    : parsedRows.length

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border-border/60 bg-card p-0 shadow-2xl sm:max-w-4xl lg:max-w-5xl">
        {/* Top Header & Wizard Stepper */}
        <div className="flex flex-col gap-4 border-b border-border/40 bg-muted/20 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <DialogHeader className="p-0 text-left">
              <DialogTitle className="flex items-center gap-2.5 text-lg font-black tracking-tight text-foreground">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                Import Bank Statement
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Upload your CSV statement, verify starting & ending balances,
                and map columns.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Stepper Pill */}
          <div className="flex items-center space-x-2 self-start rounded-2xl border border-border/50 bg-background/60 p-1 sm:self-auto">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all",
                step === 1
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
                1
              </span>
              File & Balances
            </button>
            <button
              type="button"
              disabled={!csvFile}
              onClick={() => csvFile && setStep(2)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all",
                step === 2
                  ? "bg-primary text-white shadow-sm"
                  : !csvFile
                    ? "cursor-not-allowed text-muted-foreground opacity-50"
                    : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
                2
              </span>
              Column Mapping & Preview
            </button>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 ? (
            multiCurrencyResult ? (
              /* Multi-Currency Ingestion Result View */
              <div className="space-y-6">
                <div className="flex items-center gap-3.5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black tracking-tight text-foreground">
                      Multi-Currency Statement Ingested
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      This statement contains{" "}
                      {multiCurrencyResult.createdStatements.length} independent
                      currency ledgers. Select a ledger to begin reconciliation:
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {multiCurrencyResult.createdStatements.map((stmt) => {
                    const acc = accounts.find((a) => a.id === stmt.accountId)
                    const report = multiCurrencyResult.sectionReports.find(
                      (r) => r.currency === acc?.currency
                    )
                    return (
                      <div
                        key={stmt.id}
                        className="flex flex-col justify-between space-y-4 rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm transition-all hover:border-primary/50"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                              {acc?.currency || "Currency"}
                            </span>
                            {report?.isBalanced ? (
                              <span className="flex items-center text-[11px] font-bold text-emerald-500">
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                Balanced (Δ = 0)
                              </span>
                            ) : (
                              <span className="flex items-center text-[11px] font-bold text-rose-500">
                                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                                Discrepancy:{" "}
                                {formatAmount(
                                  report?.discrepancy || 0,
                                  acc?.currency
                                )}
                              </span>
                            )}
                          </div>
                          <h5 className="text-sm font-bold text-foreground">
                            {acc?.name || "Target Account"}
                          </h5>
                          <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs text-muted-foreground">
                            <span>Ending Balance:</span>
                            <span className="font-mono font-bold text-foreground">
                              {formatAmount(
                                stmt.statementEndingBalance,
                                acc?.currency
                              )}
                            </span>
                          </div>
                        </div>

                        <Button
                          type="button"
                          onClick={() => {
                            handleModalOpenChange(false)
                            onImportSuccess(stmt.id || "")
                          }}
                          className="w-full rounded-xl bg-primary text-xs font-bold text-white shadow-md transition-all hover:scale-[1.01]"
                        >
                          Reconcile {acc?.currency} Statement
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* STEP 1: Upload & Balances */
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left Column: Dropzone & File Info */}
                <div className="space-y-4 lg:col-span-6">
                  <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    Statement File (PDF or CSV)
                  </Label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt,text/csv,application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleProcessFile(file)
                    }}
                  />

                  {pdfFile ? (
                    <div className="space-y-4 rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center space-x-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-foreground">
                              {pdfFile.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(pdfFile.size / 1024).toFixed(1)} KB •{" "}
                              <span className="font-semibold text-primary">
                                Janus Statement Extraction
                              </span>
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPdfFile(null)
                            fileInputRef.current?.click()
                          }}
                          className="h-8 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          Change
                        </Button>
                      </div>

                      {needsPassword && (
                        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
                            <Lock className="h-4 w-4" />
                            Password-Protected Statement
                          </div>
                          <p className="text-xs text-muted-foreground">
                            This statement PDF is encrypted. Enter the
                            decryption password:
                          </p>
                          <div className="flex gap-2">
                            <Input
                              type="password"
                              placeholder="PDF password"
                              value={pdfPassword}
                              onChange={(e) => setPdfPassword(e.target.value)}
                              className="h-9 rounded-xl bg-background/80 text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                ingestDocMutation.isPending || !pdfPassword
                              }
                              onClick={() => handleIngestPdf()}
                              className="rounded-xl text-xs font-bold"
                            >
                              {ingestDocMutation.isPending && (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              )}
                              Unlock
                            </Button>
                          </div>
                        </div>
                      )}

                      {pdfError && (
                        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>{pdfError}</span>
                        </div>
                      )}

                      {!needsPassword && (
                        <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5 font-bold text-foreground">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            Autonomous Extractor
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            Saturn AI will extract all currency ledgers (DOP,
                            USD, etc.), verify double-entry balance mathematics,
                            and generate ready-to-reconcile statement drafts.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : !csvFile ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault()
                        setIsDragging(true)
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setIsDragging(false)
                        const file = e.dataTransfer.files?.[0]
                        if (file) handleProcessFile(file)
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "group flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200",
                        isDragging
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                        <UploadCloud className="h-6 w-6" />
                      </div>
                      <p className="mt-3 text-sm font-bold text-foreground">
                        Click to browse or drag & drop Statement
                      </p>
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                        Supports PDF statements (single & multi-currency) or CSV
                        exports.
                      </p>
                      <div className="mt-4 flex gap-1.5">
                        <span className="rounded-md border border-border/50 bg-background/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          .PDF
                        </span>
                        <span className="rounded-md border border-border/50 bg-background/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          .CSV
                        </span>
                        <span className="rounded-md border border-border/50 bg-background/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          .TSV
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center space-x-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                            <CheckCircle2 className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-foreground">
                              {csvFile.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(csvFile.size / 1024).toFixed(1)} KB •{" "}
                              <span className="font-semibold text-foreground">
                                {parsedRows.length} total rows parsed
                              </span>
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="h-8 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          Change
                        </Button>
                      </div>

                      {/* Quick CSV Insights */}
                      {estimatedNetFlowCents !== null && (
                        <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-muted-foreground">
                              Detected Net Flow in File:
                            </span>
                            <span
                              className={cn(
                                "font-mono font-bold",
                                estimatedNetFlowCents >= 0
                                  ? "text-emerald-500"
                                  : "text-rose-500"
                              )}
                            >
                              {estimatedNetFlowCents >= 0 ? "+" : ""}
                              {formatAmount(
                                estimatedNetFlowCents,
                                targetAccount?.currency
                              )}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAutoCalculateEndingBalance}
                            className="h-7 w-full rounded-lg border-border/60 text-[11px] font-bold transition-colors hover:bg-primary/10 hover:text-primary"
                          >
                            <Calculator className="mr-1.5 h-3 w-3" />
                            Set Ending Balance = Start + Net Flow
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Column: Target Account & Balances */}
                <div className="space-y-4 lg:col-span-6">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      Target Ledger Account
                    </Label>
                    <AccountSelect
                      value={importAccountId}
                      onValueChange={setImportAccountId}
                      accounts={accounts}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      Statement Closing Date
                    </Label>
                    <div className="relative">
                      <Input
                        type="date"
                        value={statementDateStr}
                        onChange={(e) => setStatementDateStr(e.target.value)}
                        className="h-10 rounded-xl bg-background/50 pl-9 text-xs font-medium"
                      />
                      <Calendar className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                        Starting Balance
                      </Label>
                      <AmountInput
                        currency={targetAccount?.currency}
                        value={startingBalanceStr}
                        onValueChange={setStartingBalanceStr}
                        allowNegative={true}
                        placeholder="0.00"
                        className="h-10 rounded-xl bg-background/50 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                        Target Ending Balance
                      </Label>
                      <AmountInput
                        currency={targetAccount?.currency}
                        value={endingBalanceStr}
                        onValueChange={setEndingBalanceStr}
                        allowNegative={true}
                        placeholder="0.00"
                        className="h-10 rounded-xl bg-background/50 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 rounded-2xl border border-border/40 bg-muted/10 p-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Reconciliation Tip
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      The reconciliation engine verifies that the net sum of all
                      statement lines equals your ending balance minus starting
                      balance.
                    </p>
                  </div>
                </div>
              </div>
            )
          ) : (
            /* STEP 2: Column Mapping & Live Preview */
            <div className="space-y-5">
              {/* Mapping Controls Header */}
              <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm sm:flex-row sm:items-center">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center rounded-xl border border-border/60 bg-muted/40 p-1">
                    <button
                      type="button"
                      onClick={() => setIsSeparateDebitCredit(false)}
                      className={cn(
                        "rounded-lg px-3 py-1 text-xs font-bold transition-all",
                        !isSeparateDebitCredit
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Single Amount Column (+/-)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSeparateDebitCredit(true)}
                      className={cn(
                        "rounded-lg px-3 py-1 text-xs font-bold transition-all",
                        isSeparateDebitCredit
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Separate Debit / Credit Columns
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center space-x-2 text-xs font-semibold text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => setHasHeader(e.target.checked)}
                    className="h-4 w-4 rounded border-border/60 text-primary focus:ring-primary"
                  />
                  <span>First row contains column headers</span>
                </label>
              </div>

              {/* Column Selectors Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-blue-500 uppercase">
                    <Calendar className="h-3 w-3" /> Date Column
                  </span>
                  <Select
                    value={String(dateColIndex)}
                    onValueChange={(v) => setDateColIndex(Number(v))}
                  >
                    <SelectTrigger className="h-8 rounded-xl bg-background/80 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxColumns }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          Col {i + 1}{" "}
                          {hasHeader && parsedRows[0]?.[i]
                            ? `("${parsedRows[0][i]}")`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-amber-500 uppercase">
                    <FileText className="h-3 w-3" /> Description
                  </span>
                  <Select
                    value={String(descColIndex)}
                    onValueChange={(v) => setDescColIndex(Number(v))}
                  >
                    <SelectTrigger className="h-8 rounded-xl bg-background/80 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxColumns }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          Col {i + 1}{" "}
                          {hasHeader && parsedRows[0]?.[i]
                            ? `("${parsedRows[0][i]}")`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!isSeparateDebitCredit ? (
                  <div className="space-y-1.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-emerald-500 uppercase">
                      <DollarSign className="h-3 w-3" /> Net Amount (+/-)
                    </span>
                    <Select
                      value={String(amountColIndex)}
                      onValueChange={(v) => setAmountColIndex(Number(v))}
                    >
                      <SelectTrigger className="h-8 rounded-xl bg-background/80 text-xs font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: maxColumns }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            Col {i + 1}{" "}
                            {hasHeader && parsedRows[0]?.[i]
                              ? `("${parsedRows[0][i]}")`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3">
                      <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-rose-500 uppercase">
                        <DollarSign className="h-3 w-3" /> Debit Column
                      </span>
                      <Select
                        value={String(debitColIndex)}
                        onValueChange={(v) => setDebitColIndex(Number(v))}
                      >
                        <SelectTrigger className="h-8 rounded-xl bg-background/80 text-xs font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: maxColumns }, (_, i) => (
                            <SelectItem key={i} value={String(i)}>
                              Col {i + 1}{" "}
                              {hasHeader && parsedRows[0]?.[i]
                                ? `("${parsedRows[0][i]}")`
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                      <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-emerald-500 uppercase">
                        <DollarSign className="h-3 w-3" /> Credit Column
                      </span>
                      <Select
                        value={String(creditColIndex)}
                        onValueChange={(v) => setCreditColIndex(Number(v))}
                      >
                        <SelectTrigger className="h-8 rounded-xl bg-background/80 text-xs font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: maxColumns }, (_, i) => (
                            <SelectItem key={i} value={String(i)}>
                              Col {i + 1}{" "}
                              {hasHeader && parsedRows[0]?.[i]
                                ? `("${parsedRows[0][i]}")`
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="space-y-1.5 rounded-2xl border border-purple-500/30 bg-purple-500/5 p-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-purple-500 uppercase">
                    <Hash className="h-3 w-3" /> Reference (Optional)
                  </span>
                  <Select
                    value={String(refColIndex)}
                    onValueChange={(v) => setRefColIndex(Number(v))}
                  >
                    <SelectTrigger className="h-8 rounded-xl bg-background/80 text-xs font-medium">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">None</SelectItem>
                      {Array.from({ length: maxColumns }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          Col {i + 1}{" "}
                          {hasHeader && parsedRows[0]?.[i]
                            ? `("${parsedRows[0][i]}")`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Wide Interactive Table Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground">
                  <span>
                    Live Spreadsheet Preview ({dataRowsCount} lines detected)
                  </span>
                  <span>
                    Showing first {Math.min(8, parsedRows.length)} rows
                  </span>
                </div>

                <div className="max-h-64 overflow-x-auto rounded-2xl border border-border/40 bg-card shadow-inner">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-border/40 bg-muted/80 backdrop-blur-sm">
                      <tr>
                        {Array.from({ length: maxColumns }, (_, i) => {
                          const isDate = dateColIndex === i
                          const isDesc = descColIndex === i
                          const isAmt =
                            !isSeparateDebitCredit && amountColIndex === i
                          const isDebit =
                            isSeparateDebitCredit && debitColIndex === i
                          const isCredit =
                            isSeparateDebitCredit && creditColIndex === i
                          const isRef = refColIndex === i

                          return (
                            <th key={i} className="p-2.5 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    "rounded-md px-2 py-0.5 text-[10px] font-black tracking-wider uppercase",
                                    isDate &&
                                      "border border-blue-500/30 bg-blue-500/20 text-blue-500",
                                    isDesc &&
                                      "border border-amber-500/30 bg-amber-500/20 text-amber-500",
                                    isAmt &&
                                      "border border-emerald-500/30 bg-emerald-500/20 text-emerald-500",
                                    isDebit &&
                                      "border border-rose-500/30 bg-rose-500/20 text-rose-500",
                                    isCredit &&
                                      "border border-emerald-500/30 bg-emerald-500/20 text-emerald-500",
                                    isRef &&
                                      "border border-purple-500/30 bg-purple-500/20 text-purple-500",
                                    !isDate &&
                                      !isDesc &&
                                      !isAmt &&
                                      !isDebit &&
                                      !isCredit &&
                                      !isRef &&
                                      "bg-muted/40 text-muted-foreground"
                                  )}
                                >
                                  {isDate && "Date"}
                                  {isDesc && "Description"}
                                  {isAmt && "Amount"}
                                  {isDebit && "Debit"}
                                  {isCredit && "Credit"}
                                  {isRef && "Reference"}
                                  {!isDate &&
                                    !isDesc &&
                                    !isAmt &&
                                    !isDebit &&
                                    !isCredit &&
                                    !isRef &&
                                    `Col ${i + 1}`}
                                </span>
                              </div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 8).map((row, rIdx) => {
                        const isHeaderRow = hasHeader && rIdx === 0
                        return (
                          <tr
                            key={rIdx}
                            className={cn(
                              "border-b border-border/20 font-mono text-[11px] transition-colors last:border-0",
                              isHeaderRow
                                ? "bg-muted/30 font-bold text-muted-foreground italic"
                                : "text-foreground hover:bg-muted/10"
                            )}
                          >
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className="max-w-[180px] truncate p-2.5"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-6 py-4">
          {step === 1 ? (
            multiCurrencyResult ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleModalOpenChange(false)}
                  className="rounded-xl text-xs font-bold text-muted-foreground"
                >
                  Dismiss
                </Button>
                <Button
                  type="button"
                  onClick={() => handleModalOpenChange(false)}
                  className="rounded-xl bg-primary px-5 text-xs font-bold text-white shadow-md transition-all hover:scale-[1.01]"
                >
                  Done
                </Button>
              </>
            ) : pdfFile ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleModalOpenChange(false)}
                  className="rounded-xl text-xs font-bold text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={ingestDocMutation.isPending || !pdfBase64}
                  onClick={() => handleIngestPdf()}
                  className="h-10 rounded-xl bg-gradient-to-r from-primary to-accent px-6 text-xs font-bold text-white shadow-lg transition-all hover:scale-[1.01]"
                >
                  {ingestDocMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Extract & Reconcile with Janus
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleModalOpenChange(false)}
                  className="rounded-xl text-xs font-bold text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!csvFile || !importAccountId}
                  onClick={() => setStep(2)}
                  className="rounded-xl bg-primary px-5 text-xs font-bold text-white shadow-md transition-all hover:scale-[1.01]"
                >
                  Continue to Column Mapping
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </>
            )
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(1)}
                className="rounded-xl text-xs font-bold text-muted-foreground"
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back to Details
              </Button>
              <Button
                type="button"
                disabled={
                  importMutation.isPending || !csvFile || !importAccountId
                }
                onClick={handleImport}
                className="h-10 rounded-xl bg-gradient-to-r from-primary to-accent px-6 text-xs font-bold text-white shadow-lg transition-all hover:scale-[1.01]"
              >
                {importMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Start Statement Reconciliation ({dataRowsCount} lines)
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
