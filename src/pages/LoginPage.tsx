import { useState } from 'react'

export default function LoginPage() {
  const [isLoading] = useState(false)

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google'
  }


  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-900">
      <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-800 p-8 shadow-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <span className="text-4xl">🎛️</span>
          <h1 className="mt-4 text-3xl font-semibold text-gray-100">Agent Cockpit</h1>
        </div>

        {/* Message */}
        <p className="mb-8 text-center text-sm text-gray-400">
          Only your registered email address can access this application
        </p>

        {/* Sign in button */}
        <button
          onClick={handleGoogleLogin}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Sign in with Google
        </button>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-500">
          Secure authentication powered by Google OAuth
        </p>
      </div>
    </div>
  )
}
