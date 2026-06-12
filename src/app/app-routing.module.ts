import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { LoginComponent } from './components/login/login.component';
import { AsistenciaTolucaOfiComponent } from './components/toluca/asistencia-toluca-ofi/asistencia-toluca-ofi.component';
import { AsistenciaTolucaSecComponent } from './components/toluca/asistencia-toluca-sec/asistencia-toluca-sec.component';
import { AsistenciaCalComponent } from './components/calimaya/asistencia-cal/asistencia-cal.component';
import { AsistenciaAeroEsqComponent } from './components/aeropuerto/asistencia-aero-esq/asistencia-aero-esq.component';
import { AsistenciaAeroHacComponent } from './components/aeropuerto/asistencia-aero-hac/asistencia-aero-hac.component';

const routes: Routes = [
  // RUTAS PROTEGIDAS: El guard comparará el inicio del path con la 'sede' del perfil
  {
    path: '', children: []
  },
  { 
    path: 'calimaya',
    canActivate: [authGuard],
    children: [
      { path: 'asistencia-cal', component: AsistenciaCalComponent}
    ]
  },
  { 
    path: 'toluca', 
    canActivate: [authGuard],
    children: [
      { path: 'asistencia-ofi', component: AsistenciaTolucaOfiComponent },
      { path: 'asistencia-sec', component: AsistenciaTolucaSecComponent }
    ]
  },
  { 
    path: 'aeropuerto', 
    canActivate: [authGuard],
    children: [
      { path: 'asistencia-esq', component: AsistenciaAeroEsqComponent },
      { path: 'asistencia-hac', component: AsistenciaAeroHacComponent }
    ]
  },
  // Redirección inicial
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }