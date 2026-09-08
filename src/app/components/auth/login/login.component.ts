import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { NotificacionService } from '../../../services/notificacion.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  @Input() sedeSeleccionada: string | null = null;
  @Output() onSuccess = new EventEmitter<any>();

  usuario: string = '';
  password: string = '';
  cargando: boolean = false;

  constructor(
    private auth: AuthService,
    private notificaciones: NotificacionService,
    private router: Router
  ) {}

  async login() {
    if (!this.usuario || !this.password) {
      this.notificaciones.mostrar('Ingrese usuario y contraseña', 'error');
      return;
    }

    this.cargando = true;

    try {
      const respuesta = await this.auth.login(this.usuario, this.password);

      if (!respuesta || !respuesta.user) {
        this.notificaciones.mostrar('Usuario o contraseña incorrectos', 'error');
        this.cargando = false;
        return;
      }

      this.notificaciones.mostrar('Inicio de sesión exitoso', 'exito');
      this.onSuccess.emit(respuesta);
      
      // Redirección al Hub modular
      this.router.navigate(['/hub']);
      
    } catch (err: any) {
      this.notificaciones.mostrar(err.message || 'Error al conectar con el servidor', 'error');
    } finally {
      this.cargando = false;
    }
  }
}