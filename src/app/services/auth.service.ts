import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type RolSede = 'admin' | 'aeropuerto' | 'calimaya' | 'toluca';

export interface PerfilUsuario {
  id: string;
  email: string;
  sede: RolSede; // El rol/sede original asignado en la BD
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;

  // Estado del usuario activo
  private perfilSubject = new BehaviorSubject<PerfilUsuario | null>(null);
  public perfil$: Observable<PerfilUsuario | null> = this.perfilSubject.asObservable();

  // Plantel que se está visualizando activamente (para el switch del admin)
  private plantelActivoSubject = new BehaviorSubject<string>('');
  public plantelActivo$: Observable<string> = this.plantelActivoSubject.asObservable();

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    this.restaurarSesionLocal();
  }

  // 1. Restaurar sesión al recargar la página (F5)
  private restaurarSesionLocal(): void {
    const perfilGuardado = localStorage.getItem('auth_perfil');
    const plantelGuardado = localStorage.getItem('plantel_activo');

    if (perfilGuardado) {
      try {
        const perfil: PerfilUsuario = JSON.parse(perfilGuardado);
        this.perfilSubject.next(perfil);
        this.plantelActivoSubject.next(plantelGuardado || (perfil.sede === 'admin' ? 'toluca' : perfil.sede));
      } catch {
        this.logout();
      }
    }
  }

  // 2. Iniciar sesión con Supabase
// En auth.service.ts -> reemplazar el método login:
async login(email: string, password: string): Promise<{ user: User; sede: RolSede }> {
  // Limpiar cualquier residuo de sesión anterior
  localStorage.removeItem('auth_perfil');
  localStorage.removeItem('plantel_activo');

  const { data, error } = await this.supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  if (!data.user) throw new Error('No se pudo autenticar el usuario.');

  // Obtener perfil desde Supabase
  const { data: perfil, error: perfilError } = await this.supabase
    .from('perfiles')
    .select('sede')
    .eq('id', data.user.id)
    .single();

  if (perfilError) {
    console.error('Error al consultar perfil en Supabase:', perfilError);
    throw new Error('No se encontró el perfil o permisos de sede asignados.');
  }

  const sedeNormalizada = (perfil.sede || 'aeropuerto').trim().toLowerCase() as RolSede;

  const perfilUsuario: PerfilUsuario = {
    id: data.user.id,
    email: data.user.email || '',
    sede: sedeNormalizada
  };

  const plantelInicial = sedeNormalizada === 'admin' ? 'toluca' : sedeNormalizada;

  // Persistir en memoria y almacenamiento local
  this.perfilSubject.next(perfilUsuario);
  this.plantelActivoSubject.next(plantelInicial);
  localStorage.setItem('auth_perfil', JSON.stringify(perfilUsuario));
  localStorage.setItem('plantel_activo', plantelInicial);

  return { user: data.user, sede: sedeNormalizada };
}

  // 3. Switch de Planteles (Solo para ADMIN)
  public cambiarPlantelActivo(nuevoPlantel: 'aeropuerto' | 'calimaya' | 'toluca'): void {
    if (this.esAdmin()) {
      this.plantelActivoSubject.next(nuevoPlantel);
      localStorage.setItem('plantel_activo', nuevoPlantel);
    }
  }

  // 4. Getters y Validadores de Permisos
  public get usuario(): PerfilUsuario | null {
    return this.perfilSubject.value;
  }

  public get plantelActual(): string {
    return this.plantelActivoSubject.value;
  }

  public estaAutenticado(): boolean {
    return !!this.perfilSubject.value;
  }

  public esAdmin(): boolean {
    return this.perfilSubject.value?.sede === 'admin';
  }

  // Valida si el usuario puede ver la ruta de un plantel específico
  public tieneAccesoAPlantel(plantelId: string): boolean {
    const usuario = this.perfilSubject.value;
    if (!usuario) return false;

    // El admin tiene acceso universal a todos los planteles
    if (usuario.sede === 'admin') return true;

    // Los demás roles solo pueden acceder a su respectivo plantel
    return usuario.sede.toLowerCase() === plantelId.toLowerCase();
  }

  // 5. Cerrar sesión
  async logout(): Promise<void> {
    await this.supabase.auth.signOut();
    localStorage.removeItem('auth_perfil');
    localStorage.removeItem('plantel_activo');
    this.perfilSubject.next(null);
    this.plantelActivoSubject.next('');
  }

  async verificarSesionSupabase(): Promise<boolean> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) {
      this.logout();
      return false;
    }

    if (!this.usuario) {
      const { data: perfil } = await this.supabase
        .from('perfiles')
        .select('sede')
        .eq('id', session.user.id)
        .single();

      if (perfil) {
        const sede = perfil.sede.toLowerCase().trim() as RolSede;
        const perfilUsuario: PerfilUsuario = {
          id: session.user.id,
          email: session.user.email || '',
          sede
        };
        this.perfilSubject.next(perfilUsuario);
        this.plantelActivoSubject.next(sede === 'admin' ? 'toluca' : sede);
        localStorage.setItem('auth_perfil', JSON.stringify(perfilUsuario));
      }
    }
    return true;
  }
}