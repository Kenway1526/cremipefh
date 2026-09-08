import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // 1. Si ya tiene sesión activa en memoria
  if (authService.estaAutenticado()) {
    return true;
  }

  // 2. Si se recargó la página (F5), validamos la sesión contra Supabase
  const sesionActiva = await authService.verificarSesionSupabase();
  if (!sesionActiva) {
    return router.createUrlTree(['/login']);
  }

  return true;
};