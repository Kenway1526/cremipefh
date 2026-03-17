import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface Notificacion {
  mensaje: string;
  tipo: 'error' | 'exito' | 'alerta';
}

@Injectable({ providedIn: 'root' })
export class NotificacionService {
  private notificacionSubject = new Subject<Notificacion | null>();
  notificacion$ = this.notificacionSubject.asObservable();

  mostrar(mensaje: string, tipo: 'error' | 'exito' | 'alerta' = 'exito') {
    this.notificacionSubject.next({ mensaje, tipo });
    // Se limpia automáticamente tras 4 segundos
    setTimeout(() => this.notificacionSubject.next(null), 4000);
  }
}