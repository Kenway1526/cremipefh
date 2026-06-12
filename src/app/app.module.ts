import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms'; 
import { CommonModule } from '@angular/common'; // Necesario para ngClass y ngIf

import { AppComponent } from './app.component';
import { AsistenciaTolucaSecComponent } from './components/toluca/asistencia-toluca-sec/asistencia-toluca-sec.component';
import { AsistenciaTolucaOfiComponent } from './components/toluca/asistencia-toluca-ofi/asistencia-toluca-ofi.component'; //
import { AsistenciaCalComponent } from './components/calimaya/asistencia-cal/asistencia-cal.component';
import { AsistenciaAeroEsqComponent } from './components/aeropuerto/asistencia-aero-esq/asistencia-aero-esq.component';
import { AsistenciaAeroHacComponent } from './components/aeropuerto/asistencia-aero-hac/asistencia-aero-hac.component';
import { LoginComponent } from './components/login/login.component';
import { AppRoutingModule } from './app-routing.module'; // <--- 1. ASEGÚRATE QUE ESTÉ IMPORTADO
import { ReglasService } from './services/reglas.service';
import { AuthService } from './services/auth.service';
import { LucideAngularModule, Settings, X, Plus, Save, Trash2, Upload, FileSpreadsheet, Calendar, Play, Download, Check } from 'lucide-angular';
@NgModule({
  declarations: [
    AppComponent,
    AsistenciaTolucaSecComponent,
    AsistenciaTolucaOfiComponent,
    AsistenciaCalComponent,
    AsistenciaAeroEsqComponent,
    AsistenciaAeroHacComponent,
    LoginComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule,
    CommonModule,
    LucideAngularModule.pick({ Settings, X, Plus, Save, Trash2, Upload, FileSpreadsheet, Calendar, Play, Download, Check })
  ],
  providers: [ReglasService, AuthService],
  bootstrap: [AppComponent]
})
export class AppModule { }