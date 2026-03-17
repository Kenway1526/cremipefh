import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { AsistenciaTolucaOfiComponent } from './components/toluca/asistencia-toluca-ofi/asistencia-toluca-ofi.component';
import { AsistenciaTolucaSecComponent } from './components/toluca/asistencia-toluca-sec/asistencia-toluca-sec.component';

const routes: Routes = [
  // Ruta para el módulo funcional ya existente
  { path: 'toluca/secundaria', component: AsistenciaTolucaSecComponent },
  
  // NUEVA RUTA: Checador Oficinas
  { path: 'toluca/oficinas', component: AsistenciaTolucaOfiComponent },
  
  // Redirección por defecto
  { path: '', redirectTo: '/toluca/secundaria', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }