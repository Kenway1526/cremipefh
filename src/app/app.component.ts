import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NotificacionService } from './services/notificacion.service';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  autenticado = false;
  moduloPadre: string | null = null;
  rolUsuario: string | null = null; 
  cargandoSesion = true; 
  msg$ = this.notificaciones.notificacion$;

  private supabase = createClient(environment.supabaseUrl, environment.supabaseKey);

  constructor(
    private notificaciones: NotificacionService,
    public router: Router
  ) {}

  ngOnInit() {
    this.verificarSesion();
    
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      // Si navegamos a la raíz manualmente y estamos autenticados, mantenemos la vista
      if (this.router.url === '/' && this.autenticado && !this.moduloPadre) {
        this.verificarSesion();
      }
    });
  }

  async verificarSesion() {
    this.cargandoSesion = true;
    const { data: { session } } = await this.supabase.auth.getSession();
    
    if (session) {
      const perfil = await this.obtenerPerfil(session.user.id);
      this.rolUsuario = perfil?.sede || null;
      this.autenticado = true;

      // CRÍTICO: Si el usuario es de una sede fija, moduloPadre DEBE ser esa sede.
      // Si es admin, solo asignamos moduloPadre si aún no ha seleccionado una (para evitar que se limpie al refrescar).
      if (this.rolUsuario !== 'admin') {
        this.moduloPadre = this.rolUsuario;
      }
    } else {
      this.limpiarEstadoLocal();
    }
    this.cargandoSesion = false;
  }

  async obtenerPerfil(uid: string) {
    const { data, error } = await this.supabase
      .from('perfiles')
      .select('sede')
      .eq('id', uid)
      .single();
    return error ? null : data;
  }

  entrarAArea(sede: string) {
    this.moduloPadre = sede;
    // No navegamos aún, esperamos al login
  }

  alCompletarLogin(perfil: any) {
    // Validación de acceso por sede
    if (perfil.sede !== 'admin' && perfil.sede !== this.moduloPadre) {
      this.notificaciones.mostrar(`Acceso denegado: Tu usuario pertenece a ${perfil.sede.toUpperCase()}`, 'alerta');
      this.salir();
      return;
    }

    this.autenticado = true;
    this.rolUsuario = perfil.sede; 
    
    // Si NO es admin, forzamos que el moduloPadre sea su sede asignada
    if (perfil.sede !== 'admin') {
      this.moduloPadre = perfil.sede;
    }
    // Si ES admin, moduloPadre ya tiene el valor que seleccionó en el Nivel 0. NO lo tocamos.

    this.notificaciones.mostrar('Sesión iniciada', 'exito');
    this.router.navigate(['/']); 
  }

  irAlInicio() {
    if (this.router.url !== '/') {
      // Forzamos la navegación a la raíz
      this.router.navigate(['/']).then(() => {
        // Al navegar a '/', el *ngIf="router.url !== '/'" del HTML 
        // destruirá automáticamente el router-outlet
      });
    } else {
      if (this.rolUsuario === 'admin') {
        this.moduloPadre = null;
      }
    }
  }

  async salir() {
    try {
      await this.supabase.auth.signOut();
    } catch (err) {
      console.error("Error signout:", err);
    }
    
    this.limpiarEstadoLocal();

    this.router.navigate(['/'], { replaceUrl: true }).then(() => {
      window.location.reload();
    });
  }

  private limpiarEstadoLocal() {
    this.autenticado = false;
    this.moduloPadre = null;
    this.rolUsuario = null;
  }
}