import * as pdfjsLib from "pdfjs-dist"
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export interface PdfSecurityCheckResult {
  isEncrypted: boolean
  error?: string
}

export interface PdfPasswordVerifyResult {
  valid: boolean
  error?: string
}

/**
 * Checks whether a given PDF file or ArrayBuffer is password-protected/encrypted.
 * Does not make any network requests.
 */
export async function checkPdfEncryption(
  data: ArrayBuffer | Uint8Array
): Promise<PdfSecurityCheckResult> {
  try {
    // Clone array buffer to prevent detachment by worker
    const bufferCopy =
      data instanceof Uint8Array ? data.slice(0) : new Uint8Array(data.slice(0))

    const loadingTask = pdfjsLib.getDocument({
      data: bufferCopy,
    })

    await loadingTask.promise
    await loadingTask.destroy()
    return { isEncrypted: false }
  } catch (err: unknown) {
    const isPasswordError =
      (err &&
        typeof err === "object" &&
        "name" in err &&
        err.name === "PasswordException") ||
      (err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: number }).code ===
          pdfjsLib.PasswordResponses.NEED_PASSWORD)

    if (isPasswordError) {
      return { isEncrypted: true }
    }

    return {
      isEncrypted: false,
      error:
        err instanceof Error ? err.message : "Failed to parse PDF document",
    }
  }
}

/**
 * Validates a password against an encrypted PDF client-side in-place.
 * Returns valid: true if password successfully unlocks the PDF, false if incorrect.
 */
export async function verifyPdfPassword(
  data: ArrayBuffer | Uint8Array,
  password: string
): Promise<PdfPasswordVerifyResult> {
  try {
    const bufferCopy =
      data instanceof Uint8Array ? data.slice(0) : new Uint8Array(data.slice(0))

    const loadingTask = pdfjsLib.getDocument({
      data: bufferCopy,
      password,
    })

    await loadingTask.promise
    await loadingTask.destroy()
    return { valid: true }
  } catch (err: unknown) {
    const isPasswordError =
      (err &&
        typeof err === "object" &&
        "name" in err &&
        err.name === "PasswordException") ||
      (err &&
        typeof err === "object" &&
        "code" in err &&
        ((err as { code: number }).code ===
          pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ||
          (err as { code: number }).code ===
            pdfjsLib.PasswordResponses.NEED_PASSWORD))

    if (isPasswordError) {
      return { valid: false, error: "Incorrect password" }
    }

    return {
      valid: false,
      error: err instanceof Error ? err.message : "Failed to verify password",
    }
  }
}
