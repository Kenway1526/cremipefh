import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AuthService } from '../../services/auth.service'; // Cambio a AuthService
import { NotificacionService } from '../../services/notificacion.service';

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
    private auth: AuthService, // Inyectamos el servicio correcto
    private notificaciones: NotificacionService
  ) {}

  async login() {
    if (!this.usuario || !this.password) {
      this.notificaciones.mostrar('Ingrese usuario y contraseña', 'alerta');
      return;
    }

    this.cargando = true;

    try {
      // CORRECCIÓN: Capturamos el objeto completo retornado por el servicio
      const respuesta = await this.auth.login(this.usuario, this.password);

      // Verificamos si existe el usuario en la respuesta
      if (!respuesta || !respuesta.user) {
        this.notificaciones.mostrar('Usuario o contraseña incorrectos', 'error');
        this.cargando = false;
        return;
      }

      // Éxito: Emitimos la respuesta (que contiene user y sede)
      this.onSuccess.emit(respuesta);
      
    } catch (err: any) {
      // Si el servicio lanza un error (throw), lo capturamos aquí
      this.notificaciones.mostrar(err.message || 'Error al conectar con el servidor', 'error');
      this.cargando = false;
    }
  }
}