import { Autocomplete, TextField } from '@mui/material'
import type { Dog, DogChoice } from '../types'

interface DogPickerProps {
  dogs: Dog[]
  value: DogChoice | null
  onChange: (value: DogChoice | null) => void
  error?: string
}

export default function DogPicker({ dogs, value, onChange, error }: DogPickerProps) {
  return (
    <Autocomplete<Dog, false, false, true>
      freeSolo
      fullWidth
      options={dogs}
      value={value?.kind === 'existing' ? value.dog : null}
      inputValue={value === null ? '' : value.kind === 'existing' ? value.dog.name : value.name}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
      isOptionEqualToValue={(option, selected) => typeof selected !== 'string' && option.id === selected.id}
      onChange={(_, selected) => {
        if (selected === null) onChange(null)
        else if (typeof selected === 'string') onChange({ kind: 'new', name: selected })
        else onChange({ kind: 'existing', dog: selected })
      }}
      onInputChange={(_, text, reason) => {
        if (reason === 'input') onChange(text ? { kind: 'new', name: text } : null)
        if (reason === 'clear') onChange(null)
      }}
      renderInput={(params) => <TextField {...params} label="Dog" error={!!error} helperText={error} />}
    />
  )
}
