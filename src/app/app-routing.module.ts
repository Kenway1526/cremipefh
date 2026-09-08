import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Guards
import { authGuard } from './guards/auth.guard';
import { PlantelAccessGuard } from './guards/plantel-access.guard';

// Módulo Auth & Hub
import { LoginComponent } from './components/auth/login/login.component';
import { PlantelesHubComponent } from './components/planteles-hub/planteles-hub.component';

// Módulos Genéricos Reutilizables
import { ChecadorViewComponent } from './components/modulos/asistencias/checador-view.component';
import { EmpleadosViewComponent } from './components/modulos/empleados/empleados-view.component';

// Componentes Legacy (Sedes individuales temporales)
import { AsistenciaTolucaOfiComponent } from './components/toluca/asistencia-toluca-ofi/asistencia-toluca-ofi.component';
import { AsistenciaTolucaSecComponent } from './components/toluca/asistencia-toluca-sec/asistencia-toluca-sec.component';
import { AsistenciaCalComponent } from './components/calimaya/asistencia-cal/asistencia-cal.component';
import { AsistenciaAeroEsqComponent } from './components/aeropuerto/asistencia-aero-esq/asistencia-aero-esq.component';
import { AsistenciaAeroHacComponent } from './components/aeropuerto/asistencia-aero-hac/asistencia-aero-hac.component';

const routes: Routes = [
  // 1. Acceso Público
  { path: 'login', component: LoginComponent },

  // 2. Hub Principal de Planteles y Cards
  { 
    path: 'hub', 
    component: PlantelesHubComponent, 
    canActivate: [authGuard] 
  },

  // 3. Módulos Parametrizados (Nueva Arquitectura)
  { 
    path: 'modulos/asistencias/:plantelId/:sedeId', 
    component: ChecadorViewComponent, 
    canActivate: [authGuard, PlantelAccessGuard] 
  },
  { 
    path: 'modulos/empleados/:plantelId', 
    component: EmpleadosViewComponent, 
    canActivate: [authGuard, PlantelAccessGuard] 
  },

  // 4. Rutas Legacy (Mantenidas temporalmente)
  { 
    path: 'calimaya',
    canActivate: [authGuard, PlantelAccessGuard],
    children: [
      { path: 'asistencia-cal', component: AsistenciaCalComponent }
    ]
  },
  { 
    path: 'toluca', 
    canActivate: [authGuard, PlantelAccessGuard],
    children: [
      { path: 'asistencia-ofi', component: AsistenciaTolucaOfiComponent },
      { path: 'asistencia-sec', component: AsistenciaTolucaSecComponent }
    ]
  },
  { 
    path: 'aeropuerto', 
    canActivate: [authGuard, PlantelAccessGuard],
    children: [
      { path: 'asistencia-esq', component: AsistenciaAeroEsqComponent },
      { path: 'asistencia-hac', component: AsistenciaAeroHacComponent }
    ]
  },

  // Redirecciones por defecto
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }