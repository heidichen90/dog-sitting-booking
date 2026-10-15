import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import 'dayjs/locale/en-gb'
import App from './App.jsx'

const theme = createTheme({
  palette: {
    primary: { main: '#c8793a' },
    background: { default: '#f5f0eb' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiDayCalendar: {
      defaultProps: {
        dayOfWeekFormatter: (date) => date.format('dd').charAt(0),
      },
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
        <App />
      </LocalizationProvider>
    </ThemeProvider>
  </StrictMode>,
)
