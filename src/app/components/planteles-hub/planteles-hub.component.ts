import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';

export interface SubModuloCard {
  id: string;
  titulo: string;
  icono: string;
  ruta: string;
  tipo: 'checador' | 'empleados' | 'contratos';
}

export interface PlantelConfig {
  id: string;
  nombre: string;
  subModulos: SubModuloCard[];
}

@Component({
  selector: 'app-planteles-hub',
  templateUrl: './planteles-hub.component.html',
  styleUrls: ['./planteles-hub.component.css']
})
export class PlantelesHubComponent implements OnInit, OnDestroy {

  public esAdmin: boolean = false;
  public plantelSeleccionado: string = 'aeropuerto';
  private subs: Subscription = new Subscription();

  // Mapeo exhaustivo de cards por plantel
  public catalogoPlanteles: Record<string, PlantelConfig> = {
    'toluca': {
      id: 'toluca',
      nombre: 'MÓDULOS: TOLUCA',
      subModulos: [
        { id: 'secundaria', titulo: 'SECUNDARIA TOLUCA', icono: '📄', ruta: '/modulos/asistencias/toluca/secundaria', tipo: 'checador' },
        { id: 'oficinas', titulo: 'OFICINAS TOLUCA', icono: '🏢', ruta: '/modulos/asistencias/toluca/oficinas', tipo: 'checador' },
        { id: 'empleados-tol', titulo: 'DIRECTORIO EMPLEADOS', icono: '👥', ruta: '/modulos/empleados/toluca', tipo: 'empleados' }
      ]
    },
    'aeropuerto': {
      id: 'aeropuerto',
      nombre: 'MÓDULOS: AEROPUERTO',
      subModulos: [
        { id: 'esquina', titulo: 'AERO ESQUINA', icono: '✈️', ruta: '/modulos/asistencias/aeropuerto/esquina', tipo: 'checador' },
        { id: 'hacienda', titulo: 'AERO HACIENDA', icono: '🏨', ruta: '/modulos/asistencias/aeropuerto/hacienda', tipo: 'checador' },
        { id: 'empleados-aero', titulo: 'DIRECTORIO EMPLEADOS', icono: '👥', ruta: '/modulos/empleados/aeropuerto', tipo: 'empleados' }
      ]
    },
    'calimaya': {
      id: 'calimaya',
      nombre: 'MÓDULOS: CALIMAYA',
      subModulos: [
        { id: 'calimaya', titulo: 'CHECADOR CALIMAYA', icono: '🏫', ruta: '/modulos/asistencias/calimaya/calimaya', tipo: 'checador' },
        { id: 'empleados-cal', titulo: 'DIRECTORIO EMPLEADOS', icono: '👥', ruta: '/modulos/empleados/calimaya', tipo: 'empleados' }
      ]
    }
  };

  public listaPlantelesAdmin = [
    { id: 'toluca', label: 'Toluca' },
    { id: 'aeropuerto', label: 'Aeropuerto' },
    { id: 'calimaya', label: 'Calimaya' }
  ];

  constructor(
    private authService: AuthService,
    private router: Router,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // 1. Carga inmediata síncrona
    this.sincronizarEstadoUsuario();

    // 2. Suscripción reactiva al perfil
    this.subs.add(
      this.authService.perfil$.subscribe(perfil => {
        if (perfil && perfil.sede) {
          this.esAdmin = perfil.sede === 'admin';
          if (!this.esAdmin) {
            this.plantelSeleccionado = perfil.sede.toLowerCase().trim();
          }
          this.cd.detectChanges();
        }
      })
    );

    // 3. Suscripción reactiva al selector de plantel (Admin)
    this.subs.add(
      this.authService.plantelActivo$.subscribe(plantel => {
        if (this.esAdmin && plantel) {
          this.plantelSeleccionado = plantel.toLowerCase().trim();
          this.cd.detectChanges();
        }
      })
    );
  }

  private sincronizarEstadoUsuario(): void {
    const usuario = this.authService.usuario;
    if (usuario) {
      this.esAdmin = usuario.sede === 'admin';
      this.plantelSeleccionado = this.esAdmin 
        ? (this.authService.plantelActual || 'toluca') 
        : usuario.sede.toLowerCase().trim();
    } else {
      const local = localStorage.getItem('auth_perfil');
      if (local) {
        try {
          const parsed = JSON.parse(local);
          this.esAdmin = parsed.sede === 'admin';
          this.plantelSeleccionado = this.esAdmin
            ? (localStorage.getItem('plantel_activo') || 'toluca')
            : parsed.sede.toLowerCase().trim();
        } catch {}
      }
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  public onCambiarPlantel(nuevoPlantel: string): void {
    if (this.esAdmin) {
      this.plantelSeleccionado = nuevoPlantel;
      this.authService.cambiarPlantelActivo(nuevoPlantel as any);
      this.cd.detectChanges();
    }
  }

  public get configActual(): PlantelConfig {
    const key = (this.plantelSeleccionado || '').toLowerCase().trim();
    return this.catalogoPlanteles[key] || this.catalogoPlanteles['aeropuerto'];
  }

  public navegarAModulo(ruta: string): void {
    this.router.navigate([ruta]);
  }

  public cerrarSesion(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}