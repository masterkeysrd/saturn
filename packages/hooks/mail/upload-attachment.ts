import { getClientConfig } from "@saturn/api/client"
import { defaultStorage } from "@saturn/api/storage"
import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"

export interface UploadDraftAttachmentOptions {
  draftId: string
  file: File | Blob
  filename?: string
  onProgress?: (progressPct: number) => void
}

/**
 * Uploads a file attachment for a draft via multipart/form-data.
 * Reports upload progress via optional onProgress callback.
 */
export async function uploadDraftAttachment({
  draftId,
  file,
  filename,
  onProgress,
}: UploadDraftAttachmentOptions): Promise<Attachment> {
  const clientConfig = getClientConfig()
  const storage = clientConfig.storage || defaultStorage
  const session = await storage.getSession()
  const token = session.accessToken
  const spaceId = await storage.getActiveSpaceId()

  const baseUrl = clientConfig.baseUrl || ""
  const url = `${baseUrl}/api/v1/mail/drafts/${draftId}/attachments`

  const formData = new FormData()
  if (filename) {
    formData.append("file", file, filename)
  } else {
    formData.append("file", file)
  }

  return new Promise<Attachment>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url, true)

    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`)
    }
    if (spaceId) {
      xhr.setRequestHeader("Space-Id", spaceId)
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100)
          onProgress(pct)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText) as Attachment
          resolve(res)
        } catch {
          reject(new Error("Failed to parse attachment response"))
        }
      } else {
        reject(
          new Error(
            xhr.responseText || `Upload failed with status ${xhr.status}`
          )
        )
      }
    }

    xhr.onerror = () => {
      reject(new Error("Network error during attachment upload"))
    }

    xhr.send(formData)
  })
}
