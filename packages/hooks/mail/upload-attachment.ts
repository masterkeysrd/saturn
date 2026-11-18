import { getClientConfig, refreshSession } from "@saturn/api/client"
import { defaultStorage } from "@saturn/api/storage"
import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"

export type UploadAttachmentFile =
  File | Blob | { uri: string; name?: string; type?: string }

export interface UploadDraftAttachmentOptions {
  draftId: string
  file: UploadAttachmentFile
  filename?: string
  onProgress?: (progressPct: number) => void
}

function sendUploadXHR(
  url: string,
  formData: FormData,
  token: string | null,
  spaceId: string | null,
  onProgress?: (progressPct: number) => void
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url, true)
    xhr.withCredentials = true

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
      resolve({ status: xhr.status, responseText: xhr.responseText })
    }

    xhr.onerror = () => {
      reject(new Error("Network error during attachment upload"))
    }

    xhr.send(formData)
  })
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

  const buildFormData = () => {
    const formData = new FormData()
    if (typeof Blob !== "undefined" && file instanceof Blob) {
      if (filename) {
        formData.append("file", file, filename)
      } else {
        formData.append("file", file)
      }
    } else {
      const rnObj = file as { uri: string; name?: string; type?: string }
      const rnFile = {
        uri: rnObj.uri,
        name: filename || rnObj.name || "attachment",
        type: rnObj.type || "application/octet-stream",
      }
      formData.append("file", rnFile as unknown as Blob)
    }
    return formData
  }

  let res = await sendUploadXHR(
    url,
    buildFormData(),
    token,
    spaceId,
    onProgress
  )

  if (res.status === 401) {
    let newAccessToken: string
    try {
      newAccessToken = await refreshSession()
    } catch (refreshErr) {
      clientConfig.onUnauthorized?.()
      throw refreshErr
    }

    res = await sendUploadXHR(
      url,
      buildFormData(),
      newAccessToken,
      spaceId,
      onProgress
    )
    if (res.status === 401) {
      clientConfig.onUnauthorized?.()
    }
  }

  if (res.status >= 200 && res.status < 300) {
    try {
      return JSON.parse(res.responseText) as Attachment
    } catch {
      throw new Error("Failed to parse attachment response")
    }
  }

  throw new Error(res.responseText || `Upload failed with status ${res.status}`)
}
