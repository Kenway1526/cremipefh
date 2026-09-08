import { createClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

export const supabase = createClient(
  environment.supabaseUrl, 
  environment.supabaseKey, 
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Desactiva el candado que causa el NavigatorLockAcquireTimeoutError
      lock: async (_name, _acquireTimeout, fn) => {
        return await fn();
      }
    }
  }
);