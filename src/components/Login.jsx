import { useState, useEffect } from 'react'
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'
import emailjs from '@emailjs/browser'
import { supabase } from '../supabaseClient'
import './Login.css'

// Helper to translate cryptic/technical backend errors into user-friendly messages
const getFriendlyErrorMessage = (rawError) => {
  if (!rawError) return ''
  const msg = typeof rawError === 'string' ? rawError : rawError.message || ''
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login credentials')) {
    return 'Incorrect email or password. Please verify your credentials or reset your password.'
  }
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return 'An account with this email already exists. Please log in instead.'
  }
  if (lower.includes('password should be at least') || lower.includes('password must be at least')) {
    return 'Password must be at least 6 characters long.'
  }
  if (lower.includes('auth session missing') || lower.includes('session missing')) {
    return 'Your reset session has expired or is invalid. Please request a new password reset link below.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Please verify your email address before signing in. Check your inbox.'
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a minute and try again.'
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Network connection error. Please check your internet connection.'
  }
  return msg
}

function Login({ onLogin, isRecoveryMode = false, onPasswordResetComplete, initialError = '' }) {
  const queryParams = new URLSearchParams(window.location.search)
  const resetEmailFromUrl = queryParams.get('email')
  const isDirectReset = queryParams.get('mode') === 'reset' || isRecoveryMode

  const [mode, setMode] = useState(isDirectReset ? 'forgot' : 'login')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // 💾 Check if an email was previously remembered
  const savedEmail = localStorage.getItem('rememberedEmail') || ''

  const [email, setEmail] = useState(resetEmailFromUrl || savedEmail)
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(Boolean(savedEmail))
  const [showPassword, setShowPassword] = useState(false)

  const [isSettingNewPassword, setIsSettingNewPassword] = useState(isDirectReset && !initialError)
  const [isSending, setIsSending] = useState(false)

  // Feedback states
  const [generalError, setGeneralError] = useState(initialError)
  const [fieldErrors, setFieldErrors] = useState({})
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (initialError) {
      setGeneralError(initialError)
      setMode('forgot')
      setIsSettingNewPassword(false)
    }
  }, [initialError])

  useEffect(() => {
    if (isRecoveryMode && !initialError) {
      setMode('forgot')
      setIsSettingNewPassword(true)
      setGeneralError('')
      setSuccess('')
    }
  }, [isRecoveryMode, initialError])

  useEffect(() => {
    if (isDirectReset) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [isDirectReset])

  const clearFieldError = (field) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }))
    }
    if (generalError) {
      setGeneralError('')
    }
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    setIsSettingNewPassword(false)
    setGeneralError('')
    setFieldErrors({})
    setSuccess('')
  }

  // 🌐 Real Cloud Google Authentication
  const handleGoogleLogin = async () => {
    setGeneralError('')
    setFieldErrors({})
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (googleError) {
      setGeneralError(getFriendlyErrorMessage(googleError))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGeneralError('')
    setSuccess('')

    const errors = {}

    // 1. Validation: First name (signup mode)
    if (mode === 'signup' && !firstName.trim()) {
      errors.firstName = 'First name is required.'
    }

    // 2. Validation: Email (all modes except direct reset password)
    if (!isSettingNewPassword) {
      const trimmedEmail = email.trim()
      if (!trimmedEmail) {
        errors.email = 'Email address is required.'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        errors.email = 'Please enter a valid email address (e.g. name@example.com).'
      }
    }

    // 3. Validation: Password
    if (mode === 'login') {
      if (!password) {
        errors.password = 'Password is required.'
      }
    } else if (mode === 'signup') {
      if (!password) {
        errors.password = 'Password is required.'
      } else if (password.length < 6) {
        errors.password = 'Password must be at least 6 characters long.'
      }
    } else if (mode === 'forgot' && isSettingNewPassword) {
      if (!newPassword) {
        errors.newPassword = 'New password is required.'
      } else if (newPassword.length < 6) {
        errors.newPassword = 'Password must be at least 6 characters long.'
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})

    // 💾 Handle "Remember Me" persistence
    if (rememberMe) {
      localStorage.setItem('rememberedEmail', email.trim())
    } else {
      localStorage.removeItem('rememberedEmail')
    }

    // 1. FORGOT PASSWORD MODE (Supabase Native Auth Recovery)
    if (mode === 'forgot') {
      if (!isSettingNewPassword) {
        setIsSending(true)
        try {
          const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: window.location.origin,
          })

          if (resetError) {
            setGeneralError(getFriendlyErrorMessage(resetError))
            return
          }

          setSuccess(`A secure reset link has been sent to ${email.trim()}! Please check your inbox and click the link to set your new password.`)
        } catch (err) {
          console.error('Password reset error:', err)
          setGeneralError(getFriendlyErrorMessage(err))
        } finally {
          setIsSending(false)
        }
        return
      }

      setIsSending(true)
      try {
        // Verify that Supabase has an active recovery session
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (!currentSession) {
          setGeneralError('No active recovery session found. Your link may have expired. Please request a new password reset link.')
          setIsSending(false)
          return
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        })

        if (updateError) {
          setGeneralError(getFriendlyErrorMessage(updateError))
          return
        }

        setSuccess('Password updated successfully! Redirecting...')
        setTimeout(() => {
          if (onPasswordResetComplete) {
            onPasswordResetComplete()
          } else {
            handleModeChange('login')
          }
        }, 1800)
      } catch (err) {
        setGeneralError(getFriendlyErrorMessage(err))
      } finally {
        setIsSending(false)
      }
      return
    }

    // 2. SIGN UP MODE (Supabase Cloud Auth)
    if (mode === 'signup') {
      setIsSending(true)
      try {
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        })

        if (signUpError) {
          setGeneralError(getFriendlyErrorMessage(signUpError))
          return
        }

        // Supabase returns an empty identities array if user is already registered with email confirmation enabled
        if (data?.user?.identities?.length === 0) {
          setGeneralError('An account with this email already exists. Please log in instead.')
          return
        }

        if (data?.session) {
          setSuccess('Account created successfully! Logging you in...')
        } else {
          setSuccess('Account created! Please check your inbox to confirm your email before signing in.')
        }
      } catch (err) {
        setGeneralError(getFriendlyErrorMessage(err))
      } finally {
        setIsSending(false)
      }
      return
    }

    // 3. LOGIN MODE (Supabase Cloud Auth)
    if (mode === 'login') {
      setIsSending(true)
      try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (signInError) {
          const rawMsg = (signInError.message || '').toLowerCase()
          if (rawMsg.includes('invalid login credentials') || rawMsg.includes('invalid credentials')) {
            // Only flag the password as incorrect, keep email intact
            setFieldErrors({
              password: 'Incorrect password. Please try again or use Forgot password.'
            })
            setGeneralError('')
          } else {
            setGeneralError(getFriendlyErrorMessage(signInError))
          }
          return
        }
      } catch (err) {
        setGeneralError(getFriendlyErrorMessage(err))
      } finally {
        setIsSending(false)
      }
      return
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-center-card">
        <h2 className="auth-title">
          {mode === 'signup' && 'Create an account'}
          {mode === 'login' && 'Welcome back'}
          {mode === 'forgot' && (isSettingNewPassword ? 'Create new password' : 'Reset your password')}
        </h2>
        
        <p className="auth-subtext">
          {mode === 'signup' && (
            <>
              Already have an account? 
              <button type="button" onClick={() => handleModeChange('login')}>
                Log in
              </button>
            </>
          )}
          {mode === 'login' && (
            <>
              Don't have an account? 
              <button type="button" onClick={() => handleModeChange('signup')}>
                Sign up
              </button>
            </>
          )}
          {mode === 'forgot' && (isSettingNewPassword 
            ? 'Enter your new password below' 
            : 'Enter your email to receive a real reset link in your inbox')}
        </p>

        {generalError && (
          <div className="auth-msg error">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{generalError}</span>
          </div>
        )}
        {success && (
          <div className="auth-msg success">
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {mode === 'signup' && (
            <>
              <div className="input-row">
                <input
                  type="text"
                  className={`auth-input-field ${fieldErrors.firstName ? 'input-has-error' : ''}`}
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value)
                    clearFieldError('firstName')
                  }}
                />
                <input
                  type="text"
                  className="auth-input-field"
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              {fieldErrors.firstName && (
                <div className="field-error-msg">
                  <AlertCircle size={13} />
                  <span>{fieldErrors.firstName}</span>
                </div>
              )}
            </>
          )}

          {(!isSettingNewPassword) && (
            <>
              <input
                type="email"
                className={`auth-input-field ${fieldErrors.email ? 'input-has-error' : ''}`}
                placeholder="Email address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clearFieldError('email')
                }}
              />
              {fieldErrors.email && fieldErrors.email.trim() && (
                <div className="field-error-msg">
                  <AlertCircle size={13} />
                  <span>{fieldErrors.email}</span>
                </div>
              )}
            </>
          )}

          {mode === 'forgot' && isSettingNewPassword && (
            <>
              <div className={`password-box ${fieldErrors.newPassword ? 'input-has-error' : ''}`}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password (min 6 chars)"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    clearFieldError('newPassword')
                  }}
                />
                <button
                  type="button"
                  className="eye-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.newPassword && (
                <div className="field-error-msg">
                  <AlertCircle size={13} />
                  <span>{fieldErrors.newPassword}</span>
                </div>
              )}
            </>
          )}

          {mode !== 'forgot' && (
            <>
              <div className={`password-box ${fieldErrors.password ? 'input-has-error' : ''}`}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'signup' ? 'Create a password (min 6 chars)' : 'Enter your password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    clearFieldError('password')
                  }}
                />
                <button
                  type="button"
                  className="eye-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.password && fieldErrors.password.trim() && (
                <div className="field-error-msg">
                  <AlertCircle size={13} />
                  <span>{fieldErrors.password}</span>
                </div>
              )}
            </>
          )}

          {mode === 'signup' && (
            <label className="terms-row">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
          )}

          {mode === 'login' && (
            <div className="options-row">
              <label className="terms-row" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                className="forgot-link-btn"
                onClick={() => handleModeChange('forgot')}
              >
                Forgot password?
              </button>
            </div>
          )}

          <button 
            type="submit" 
            className="main-auth-btn"
            disabled={isSending}
          >
            {isSending ? 'Please wait...' : (
              mode === 'signup' 
                ? 'Create account' 
                : mode === 'login' 
                  ? 'Sign in' 
                  : (!isSettingNewPassword ? 'Send Reset Link' : 'Update Password')
            )}
          </button>

          {mode === 'forgot' && (
            <div style={{ textAlign: 'center', marginTop: '-10px', marginBottom: '20px' }}>
              <button
                type="button"
                className="forgot-link-btn"
                onClick={() => handleModeChange('login')}
              >
                ← Back to Log in
              </button>
            </div>
          )}

          {mode !== 'forgot' && (
            <>
              <div className="social-divider">
                <span>{mode === 'signup' ? 'Or register with' : 'Or log in with'}</span>
              </div>

              <div className="social-row">
                <button
                  type="button"
                  className="social-outline-btn"
                  onClick={handleGoogleLogin}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17 1.8 14.7 1 12 1 7.5 1 3.7 3.6 1.9 7.4l3.6 2.8C6.4 7.2 9 5 12 5z"/>
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                    <path fill="#FBBC05" d="M5.5 14.8c-.2-.7-.4-1.5-.4-2.8s.1-2.1.4-2.8L1.9 6.4C.7 8.8 0 10.4 0 12s.7 3.2 1.9 5.6l3.6-2.8z"/>
                    <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.6-2.2-6.5-5.2L1.9 16C3.7 19.8 7.5 23 12 23z"/>
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  className="social-outline-btn"
                  onClick={() => onLogin?.('Apple User')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8 1.01-2.85-.94.04-2.07.63-2.73 1.4-.58.67-.99 1.74-.95 2.78 1.06.08 2.05-.58 2.67-1.33z"/>
                  </svg>
                  Apple
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

export default Login
