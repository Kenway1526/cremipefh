import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class PlantelAccessGuard implements CanActivate {

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    // 1. Validar si existe sesión activa
    if (!this.authService.estaAutenticado()) {
      return this.router.createUrlTree(['/login']);
    }

    // 2. Obtener el ID del plantel desde los parámetros de la URL
    const plantelId = route.params['plantelId'] || route.parent?.params['plantelId'];

    if (!plantelId) {
      return true;
    }

    // 3. Validar permisos según el rol/sede del usuario
    const tieneAcceso = this.authService.tieneAccesoAPlantel(plantelId);

    if (!tieneAcceso) {
      const sedeUsuario = this.authService.usuario?.sede;
      // Redirigir al plantel asignado al usuario
      return this.router.createUrlTree(['/plantel', sedeUsuario, 'hub']);
    }

    // 4. Si es admin y entra a un plantel permitido, actualizar el plantel activo en el servicio
    if (this.authService.esAdmin()) {
      this.authService.cambiarPlantelActivo(plantelId as any);
    }

    return true;
  }
}