import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fnwhytjnrakqubxkkdis.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZud2h5dGpucmFrcXVieGtrZGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTE3MDcsImV4cCI6MjA5MzUyNzcwN30.588F_G6Q5vgMygz-gYKkbwivFIQBG6AnaDQ6kSuRSOo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
