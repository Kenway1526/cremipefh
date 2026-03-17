import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // Iniciar sesión con Correo y Contraseña
  async login(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // Si el login es correcto, obtenemos su perfil (sede y rol)
    const { data: perfil, error: perfilError } = await this.supabase
      .from('perfiles')
      .select('sede')
      .eq('id', data.user.id)
      .single();

    if (perfilError) throw perfilError;

    return { user: data.user, sede: perfil.sede };
  }

  async logout() {
    await this.supabase.auth.signOut();
  }
}