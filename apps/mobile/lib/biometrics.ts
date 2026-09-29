import { Platform } from "react-native"
import Constants from "expo-constants"
import * as LocalAuthentication from "expo-local-authentication"
import * as ExpoCrypto from "expo-crypto"
import { p256 } from "@noble/curves/nist.js"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"

// Ensure crypto.getRandomValues is globally available in React Native JS engine
const globalObj = globalThis as unknown as {
  crypto?: { getRandomValues?: (arr: ArrayBufferView) => ArrayBufferView }
}
if (!globalObj.crypto) {
  globalObj.crypto = {}
}
if (typeof globalObj.crypto.getRandomValues !== "function") {
  globalObj.crypto.getRandomValues = ((array: ArrayBufferView) => {
    if (array) {
      ExpoCrypto.getRandomValues(
        array as unknown as Parameters<typeof ExpoCrypto.getRandomValues>[0]
      )
    }
    return array
  }) as unknown as typeof globalObj.crypto.getRandomValues
}

import {
  createAuthChallenge,
  createDevice,
  loginUser,
  type LoginUserResponse,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import {
  getStoredDeviceId,
  setStoredDeviceId,
  setStoredDevicePublicKey,
  getStoredDevicePrivateKey,
  setStoredDevicePrivateKey,
  setBiometricEnabled,
  isBiometricEnabled,
  clearDeviceEnrollment,
} from "./storage"

const b64chars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function base64Encode(bytes: Uint8Array): string {
  let result = ""
  const len = bytes.length
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < len ? bytes[i + 1] : 0
    const b2 = i + 2 < len ? bytes[i + 2] : 0

    result += b64chars[b0 >> 2]
    result += b64chars[((b0 & 3) << 4) | (b1 >> 4)]
    result += i + 1 < len ? b64chars[((b1 & 15) << 2) | (b2 >> 6)] : "="
    result += i + 2 < len ? b64chars[b2 & 63] : "="
  }
  return result
}

function base64Decode(str: string): Uint8Array {
  if (typeof atob === "function") {
    try {
      const binary = atob(str)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    } catch {
      // Fallback to manual decoder
    }
  }

  const clean = str.replace(/[^A-Za-z0-9+/=]/g, "")
  let placeHolders = 0
  if (clean.endsWith("==")) placeHolders = 2
  else if (clean.endsWith("=")) placeHolders = 1

  const bytes = new Uint8Array((clean.length * 3) / 4 - placeHolders)
  let cur = 0
  for (let i = 0; i < clean.length; i += 4) {
    const enc1 = b64chars.indexOf(clean[i])
    const enc2 = b64chars.indexOf(clean[i + 1])
    const enc3 = b64chars.indexOf(clean[i + 2])
    const enc4 = b64chars.indexOf(clean[i + 3])

    bytes[cur++] = (enc1 << 2) | (enc2 >> 4)
    if (enc3 !== 64 && enc3 !== -1 && cur < bytes.length) {
      bytes[cur++] = ((enc2 & 15) << 4) | (enc3 >> 2)
    }
    if (enc4 !== 64 && enc4 !== -1 && cur < bytes.length) {
      bytes[cur++] = ((enc3 & 3) << 6) | enc4
    }
  }
  return bytes
}

export interface BiometricStatus {
  hasHardware: boolean
  isEnrolled: boolean
  supportedType: "face" | "fingerprint" | "iris" | "none"
  label: string
}

/**
 * Checks native device biometric capabilities and enrolled biometric sensors.
 */
export async function checkBiometricStatus(): Promise<BiometricStatus> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync()
    const isEnrolled = await LocalAuthentication.isEnrolledAsync()
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync()

    let supportedType: BiometricStatus["supportedType"] = "none"
    let label = "Biometrics"

    if (
      types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    ) {
      supportedType = "face"
      label = Platform.OS === "ios" ? "Face ID" : "Biometrics"
    } else if (
      types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
    ) {
      supportedType = "fingerprint"
      label = Platform.OS === "ios" ? "Touch ID" : "Biometrics"
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      supportedType = "iris"
      label = "Biometrics"
    }

    return {
      hasHardware,
      isEnrolled,
      supportedType,
      label,
    }
  } catch {
    return {
      hasHardware: false,
      isEnrolled: false,
      supportedType: "none",
      label: "Biometrics",
    }
  }
}

function parseStoredPrivateKey(stored: string): Uint8Array {
  // If stored as JSON JWK (legacy fallback)
  if (stored.startsWith("{")) {
    try {
      const parsed = JSON.parse(stored)
      if (parsed.d) {
        let b64 = parsed.d.replace(/-/g, "+").replace(/_/g, "/")
        while (b64.length % 4) {
          b64 += "="
        }
        return base64Decode(b64)
      }
    } catch {}
  }
  // If stored as 64-character hex string (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(stored)) {
    return hexToBytes(stored)
  }
  // Otherwise decode as base64
  return base64Decode(stored)
}

/**
 * Generates an asymmetric ECDSA P-256 keypair for hardware-backed device assertion.
 */
async function generateKeyPair(): Promise<{
  publicKeyBase64: string
  privateKey: string
}> {
  // Generate 48 bytes of native secure random entropy via ExpoCrypto
  const seed = ExpoCrypto.getRandomBytes(48)
  const pair = p256.keygen(seed)
  // Uncompressed ANSI X9.62 point (65 bytes: 0x04 || X || Y)
  const uncompressed = p256.getPublicKey(pair.secretKey, false)
  const publicKeyBase64 = base64Encode(uncompressed)
  const privateKey = bytesToHex(pair.secretKey)

  return { publicKeyBase64, privateKey }
}

/**
 * Signs a server challenge string using the stored device private key.
 */
async function signChallenge(
  privateKeyStr: string,
  challenge: string
): Promise<string> {
  const secretKey = parseStoredPrivateKey(privateKeyStr)
  const encoder = new TextEncoder()
  const data = encoder.encode(challenge)

  // p256.sign automatically hashes data with SHA-256 and returns a 64-byte IEEE P1363 (r || s) signature
  const signature = p256.sign(data, secretKey)
  return base64Encode(signature)
}

/**
 * Enrolls the current mobile device with the backend using hardware key generation and biometric verification.
 */
export async function enrollDeviceBiometrics(params?: {
  deviceName?: string
  totpCode?: string
}): Promise<{ deviceId: string }> {
  // 1. Verify biometric capability on this hardware
  const bioStatus = await checkBiometricStatus()
  if (!bioStatus.hasHardware || !bioStatus.isEnrolled) {
    throw new Error("Biometric authentication is not enrolled on this device")
  }

  // 2. Prompt user with native biometric dialog
  const prompt = await LocalAuthentication.authenticateAsync({
    promptMessage: `Authorize ${bioStatus.label} for Saturn`,
    cancelLabel: "Cancel",
  })
  if (!prompt.success) {
    throw new Error("Biometric authentication was cancelled or failed")
  }

  // 3. Obtain ephemeral challenge nonce from backend
  const challengeResp = await createAuthChallenge({})
  if (!challengeResp.challenge) {
    throw new Error("Failed to receive authentication challenge from server")
  }

  // 4. Generate hardware-bound ECDSA P-256 keypair
  const { publicKeyBase64, privateKey } = await generateKeyPair()

  // 5. Sign the challenge nonce using the newly generated private key
  const signature = await signChallenge(privateKey, challengeResp.challenge)

  const resolvedDeviceName =
    params?.deviceName?.trim() ||
    Constants.deviceName ||
    (Platform.OS === "ios" ? "Apple iPhone" : "Android Device")

  // 6. Create trusted device with Saturn IAM
  const regResp = await createDevice({
    device: {
      deviceName: resolvedDeviceName,
      publicKey: publicKeyBase64,
      algorithm: "ES256",
      challenge: challengeResp.challenge,
      signature,
      totpCode: params?.totpCode || "",
    },
  })

  const deviceId = regResp.id
  if (!deviceId) {
    throw new Error("Server did not return a valid device identifier")
  }

  // 7. Persist enrolled device ID and keys securely
  await setStoredDeviceId(deviceId)
  await setStoredDevicePublicKey(publicKeyBase64)
  await setStoredDevicePrivateKey(privateKey)
  await setBiometricEnabled(true)

  return { deviceId }
}

/**
 * Authenticates the user passwordlessly using the enrolled device hardware key and biometrics.
 */
export async function loginWithBiometrics(): Promise<LoginUserResponse> {
  const deviceId = await getStoredDeviceId()
  const privateKey = await getStoredDevicePrivateKey()

  if (!deviceId || !privateKey) {
    throw new Error("This device is not enrolled for biometric authentication")
  }

  const bioStatus = await checkBiometricStatus()
  const prompt = await LocalAuthentication.authenticateAsync({
    promptMessage: `Log in with ${bioStatus.label}`,
    cancelLabel: "Cancel",
  })
  if (!prompt.success) {
    throw new Error("Biometric authentication was cancelled or failed")
  }

  // 1. Fetch challenge nonce from server
  const challengeResp = await createAuthChallenge({})
  if (!challengeResp.challenge) {
    throw new Error("Failed to receive authentication challenge from server")
  }

  // 2. Sign challenge using device hardware private key
  const signature = await signChallenge(privateKey, challengeResp.challenge)

  // 3. Submit polymorphic LoginUserRequest with device_assertion
  try {
    const res = await loginUser({
      deviceAssertion: {
        deviceId,
        challenge: challengeResp.challenge,
        signature,
      },
    })
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : ""
    if (
      msg.includes("revoked") ||
      msg.includes("expired") ||
      msg.includes("inactive") ||
      msg.includes("not found")
    ) {
      await clearDeviceEnrollment()
    }
    throw err
  }
}

/**
 * Checks if this device is actively enrolled and ready for biometric sign-in.
 */
export async function isDeviceBiometricsReady(): Promise<boolean> {
  const [enabled, deviceId, privKey] = await Promise.all([
    isBiometricEnabled(),
    getStoredDeviceId(),
    getStoredDevicePrivateKey(),
  ])
  return Boolean(enabled && deviceId && privKey)
}

/**
 * Checks if this device has cryptographic credentials enrolled in secure storage.
 */
export async function checkDeviceEnrolled(): Promise<boolean> {
  const [deviceId, privKey] = await Promise.all([
    getStoredDeviceId(),
    getStoredDevicePrivateKey(),
  ])
  return Boolean(deviceId && privKey)
}
