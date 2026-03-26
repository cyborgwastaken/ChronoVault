import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dizlhcexfrpuhppcnnoz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpemxoY2V4ZnJwdWhwcGNubm96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjc1ODcsImV4cCI6MjA4NjY0MzU4N30.8CbNI9WXAoCfnGe8RcdGg1KVQTtU0iFDtOz_S2FGGzQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)