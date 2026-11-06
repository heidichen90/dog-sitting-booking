import { Box, Typography } from '@mui/material'
import PetsIcon from '@mui/icons-material/Pets'

export default function NoBookings() {
  return (
    <Box sx={{ textAlign: 'center', py: 10, color: 'text.disabled' }}>
      <PetsIcon sx={{ fontSize: 64, mb: 1 }} />
      <Typography variant="h6">No bookings yet</Typography>
      <Typography variant="body2">Create your first booking to get started.</Typography>
    </Box>
  )
}
