/**
 * lib/db.js — single Supabase client shared across all scripts.
 * Import this instead of calling createClient() in each file.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

export const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
