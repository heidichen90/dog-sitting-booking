import { Alert, Autocomplete, Box, Button, TextField, Typography } from '@mui/material'
import type { Client, ClientChoice } from '../types'

interface ClientPickerProps {
  clients: Client[]
  value: ClientChoice | null
  onChange: (value: ClientChoice | null) => void
  error?: string
}

function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export default function ClientPicker({ clients, value, onChange, error }: ClientPickerProps) {
  const sameName =
    value?.kind === 'new' && value.name.trim()
      ? clients.filter((c) => normaliseName(c.name) === normaliseName(value.name))
      : []
  const match = sameName[0]

  return (
    <Box sx={{ width: '100%' }}>
      <Autocomplete<Client, false, false, true>
        freeSolo
        fullWidth
        options={clients}
        value={value?.kind === 'existing' ? value.client : null}
        inputValue={value === null ? '' : value.kind === 'existing' ? value.client.name : value.name}
        filterOptions={(opts, { inputValue }) =>
          opts.filter((o) => normaliseName(o.name).includes(normaliseName(inputValue)))
        }
        getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
        isOptionEqualToValue={(option, selected) => typeof selected !== 'string' && option.id === selected.id}
        onChange={(_, selected) => {
          if (selected === null) onChange(null)
          else if (typeof selected === 'string') onChange({ kind: 'new', name: selected })
          else onChange({ kind: 'existing', client: selected })
        }}
        onInputChange={(_, text, reason) => {
          if (reason === 'input') onChange(text ? { kind: 'new', name: text } : null)
          if (reason === 'clear') onChange(null)
        }}
        renderOption={(props, option) => {
          const { key, ...optionProps } = props
          return (
            <li key={key} {...optionProps}>
              {option.name}
              {option.phone && (
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  {option.phone}
                </Typography>
              )}
            </li>
          )
        }}
        renderInput={(params) => <TextField {...params} label="Owner" error={!!error} helperText={error} />}
      />
      {match && (
        <Alert
          severity="info"
          sx={{ mt: 1 }}
          action={
            <Button color="inherit" size="small" onClick={() => onChange({ kind: 'existing', client: match })}>
              Use {match.name}
            </Button>
          }
        >
          {match.name} is already a client — use them?
          {sameName.length > 1 && (
            <Box>Pick from the list to choose between clients named {match.name}</Box>
          )}
        </Alert>
      )}
    </Box>
  )
}
