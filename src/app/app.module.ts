import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms'; 
import { CommonModule } from '@angular/common';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

// Componentes Nuevos (Arquitectura Modular)
import { LoginComponent } from './components/auth/login/login.component';
import { PlantelesHubComponent } from './components/planteles-hub/planteles-hub.component';
import { ChecadorViewComponent } from './components/modulos/asistencias/checador-view.component';
import { EmpleadosViewComponent } from './components/modulos/empleados/empleados-view.component';

// Componentes Legacy (Sedes individuales temporales)
import { AsistenciaTolucaSecComponent } from './components/toluca/asistencia-toluca-sec/asistencia-toluca-sec.component';
import { AsistenciaTolucaOfiComponent } from './components/toluca/asistencia-toluca-ofi/asistencia-toluca-ofi.component';
import { AsistenciaCalComponent } from './components/calimaya/asistencia-cal/asistencia-cal.component';
import { AsistenciaAeroEsqComponent } from './components/aeropuerto/asistencia-aero-esq/asistencia-aero-esq.component';
import { AsistenciaAeroHacComponent } from './components/aeropuerto/asistencia-aero-hac/asistencia-aero-hac.component';

// Servicios
import { ReglasService } from './services/reglas.service';
import { AuthService } from './services/auth.service';
import { AsistenciasService } from './services/asistencias.service';
import { EmpleadosService } from './services/empleados.service';
import { NotificacionService } from './services/notificacion.service';

// Lucide Icons
import { LucideAngularModule, Settings, X, Plus, Save, Trash2, Upload, FileSpreadsheet, Calendar, Play, Download, Check } from 'lucide-angular';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    PlantelesHubComponent,
    ChecadorViewComponent,
    EmpleadosViewComponent,
    // Declaraciones legacy temporales
    AsistenciaTolucaSecComponent,
    AsistenciaTolucaOfiComponent,
    AsistenciaCalComponent,
    AsistenciaAeroEsqComponent,
    AsistenciaAeroHacComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule,
    CommonModule,
    LucideAngularModule.pick({ 
      Settings, 
      X, 
      Plus, 
      Save, 
      Trash2, 
      Upload, 
      FileSpreadsheet, 
      Calendar, 
      Play, 
      Download, 
      Check 
    })
  ],
  providers: [
    AuthService,
    ReglasService,
    AsistenciasService,
    EmpleadosService,
    NotificacionService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }