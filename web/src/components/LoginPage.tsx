import { useRef, useState, type FormEvent } from 'react'
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material'
import { ApiError, login } from '../api/client.ts'

interface LoginPageProps {
  onLoggedIn: () => void
}

export default function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const passwordInput = useRef<HTMLInputElement>(null)

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter your username and password')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await login({ username: username.trim(), password })
      onLoggedIn()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setError(err.title)
      setPassword('')
      passwordInput.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack spacing={2.5}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Log in
          </Typography>
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            autoFocus
            fullWidth
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            inputRef={passwordInput}
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            sx={{ py: 1.5, borderRadius: 2, fontWeight: 700 }}
          >
            Log in
          </Button>
        </Stack>
      </Box>
    </Paper>
  )
}
