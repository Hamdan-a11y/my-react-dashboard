import CryptoJS from 'crypto-js'

// Secret key used to encrypt and decrypt client-side persisted state
const SECRET_KEY = 'react-app-2-vault-key-2026'

/**
 * 🔒 Encrypts data into an AES ciphertext string
 */
export const encryptData = (data) => {
  try {
    const jsonString = JSON.stringify(data)
    return CryptoJS.AES.encrypt(jsonString, SECRET_KEY).toString()
  } catch (err) {
    console.error('Encryption error:', err)
    return null
  }
}

/**
 * 🔓 Decrypts ciphertext back into the original data
 */
export const decryptData = (cipherText, defaultValue = null) => {
  if (!cipherText) return defaultValue
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY)
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8)
    if (!decryptedString) return defaultValue
    return JSON.parse(decryptedString)
  } catch (err) {
    return defaultValue
  }
}

/**
 * 🛡️ Secure Local Storage Helpers
 */
export const setSecureItem = (key, value) => {
  try {
    const encrypted = encryptData(value)
    if (encrypted) {
      localStorage.setItem(`_sec_${key}`, encrypted)
    }
  } catch (err) {
    console.error('Secure storage write failed:', err)
  }
}

export const getSecureItem = (key, defaultValue = null) => {
  try {
    const raw = localStorage.getItem(`_sec_${key}`)
    if (!raw) {
      // Fallback check for legacy non-encrypted keys
      const legacy = localStorage.getItem(key)
      if (legacy) {
        // Upgrade to secure storage and remove raw key
        setSecureItem(key, legacy)
        localStorage.removeItem(key)
        return legacy
      }
      return defaultValue
    }
    return decryptData(raw, defaultValue)
  } catch (err) {
    return defaultValue
  }
}

export const removeSecureItem = (key) => {
  try {
    localStorage.removeItem(`_sec_${key}`)
    localStorage.removeItem(key)
  } catch (err) {
    console.error('Secure storage removal failed:', err)
  }
}

/**
 * 🧹 Input Sanitization (Defense against Stored & Reflected XSS)
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/onload\s*=/gi, '')
    .replace(/onerror\s*=/gi, '')
    .replace(/onclick\s*=/gi, '')
    .replace(/onmouseover\s*=/gi, '')
    .trim()
}

/**
 * 🔐 Password Entropy & Complexity Evaluation
 */
export const calculatePasswordStrength = (password = '') => {
  const requirements = {
    length: password.length >= 8,
    hasLower: /[a-z]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  }

  let score = 0
  if (requirements.length) score += 1
  if (requirements.hasLower && requirements.hasUpper) score += 1
  if (requirements.hasNumber) score += 1
  if (requirements.hasSpecial) score += 1

  const labels = ['Too Short', 'Weak', 'Fair', 'Good', 'Strong']
  const label = password.length === 0 ? '' : labels[score]

  return {
    score,
    label,
    isValid: score >= 3 && requirements.length,
    requirements,
  }
}
