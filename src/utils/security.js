import CryptoJS from 'crypto-js'

// Secret key used to encrypt and decrypt the data
const SECRET_KEY = 'my-app-super-secure-key-2026'

// 🔒 Encrypts any data (object, array, string) into unreadable scrambled text
export const encryptData = (data) => {
  try {
    const jsonString = JSON.stringify(data)
    return CryptoJS.AES.encrypt(jsonString, SECRET_KEY).toString()
  } catch (err) {
    console.error('Encryption error:', err)
    return null
  }
}

// 🔓 Decrypts the scrambled text back into the original data
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
