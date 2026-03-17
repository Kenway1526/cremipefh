import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const authGuard = async () => {
  const router = inject(Router);
  const supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    return true; 
  } else {
    console.warn("🔒 ACCESO DENEGADO - Redirigiendo a Login");
    return router.navigate(['/login']); // Redirección explícita
  }
};