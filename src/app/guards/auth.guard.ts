import { inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot } from '@angular/router';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const authGuard = async (route: ActivatedRouteSnapshot) => {
  const router = inject(Router);
  const supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  const sedeSolicitada = route.pathFromRoot[1]?.routeConfig?.path;
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return router.navigate(['/login']);

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('sede')
    .eq('id', session.user.id)
    .single();

  if (perfil?.sede === 'admin' || perfil?.sede === sedeSolicitada) {
    return true;
  }

  // Si intenta saltar de sede, lo regresa a su origen permitido
  return router.navigate([`/${perfil?.sede}`]);
};