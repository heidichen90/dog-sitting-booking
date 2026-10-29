import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import type {} from '@mui/x-date-pickers/themeAugmentation'
import type { Dayjs } from 'dayjs'
import 'dayjs/locale/en-gb'
import App from './App.tsx'

const theme = createTheme({
  palette: {
    primary: { main: '#c8793a' },
    background: { default: '#f5f0eb' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiDayCalendar: {
      defaultProps: {
        dayOfWeekFormatter: (date: Dayjs) => date.format('dd').charAt(0),
      },
    },
  },
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
        <App />
      </LocalizationProvider>
    </ThemeProvider>
  </StrictMode>,
)
