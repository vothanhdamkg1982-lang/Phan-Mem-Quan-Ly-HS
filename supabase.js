// ============================================================
// SUPABASE CLIENT CONFIGURATION (WEB APP 3)
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.8/+esm';

// Thay thế bằng thông tin Project Supabase thực tế của bạn
const SUPABASE_URL = 'https://ohmwphdeeldmlxuuknny.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DgxnOXel9t7woqYrfInl5Q_YogcW--c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});