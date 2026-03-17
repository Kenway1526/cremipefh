import { Component } from '@angular/core';
import { NotificacionService } from './services/notificacion.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  // --- ESTADOS DE NAVEGACIÓN ---
  moduloPadre: string | null = null; // Almacena sede (aeropuerto, calimaya, toluca)
  autenticado: boolean = false;      // Estado de login exitoso
  subModulo: string | null = null;    // Ej: 'asistencia'
  subDepartamento: string | null = null; // Ej: 'sec' o 'ofi'

  // --- NOTIFICACIONES ---
  msg$ = this.notificaciones.notificacion$;

  constructor(private notificaciones: NotificacionService) {}

  /**
   * Nivel 0: Selección de Sede
   */
  entrarAArea(sede: string) {
    this.moduloPadre = sede;
    this.notificaciones.mostrar(`Sede ${sede.toUpperCase()} seleccionada`, 'alerta');
  }

  /**
   * Nivel 1: Recepción de éxito del Login
   */
  alCompletarLogin(datosUsuario: any) {
    this.autenticado = true;
    this.notificaciones.mostrar('Sesión iniciada correctamente', 'exito');
  }

  /**
   * Nivel 2: Selección de Herramienta
   * Se encarga de setear el subDepartamento para activar el procesador correcto
   */
  abrirHerramienta(modulo: string, depto: string) {
    this.subModulo = modulo;
    this.subDepartamento = depto;
    const nombreDepto = depto === 'sec' ? 'SECUNDARIA' : 'OFICINAS';
    this.notificaciones.mostrar(`Cargando procesador de ${nombreDepto}...`, 'exito');
  }

  /**
   * Cierre de Sesión y Reseteo
   */
  salir() {
    this.moduloPadre = null;
    this.autenticado = false;
    this.subModulo = null;
    this.subDepartamento = null;
    this.notificaciones.mostrar('Has salido del sistema', 'alerta');
  }
}