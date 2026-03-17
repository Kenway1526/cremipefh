import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReglasService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async getReglas() {
    const { data, error } = await this.supabase
      .from('asistencia_toluca_sec')
      .select('*')
      .order('id_empleado', { ascending: true });
    return { data, error };
  }

  async saveRegla(regla: any) {
    const { data, error } = await this.supabase
      .from('reglas_empleados')
      .upsert({
        id_empleado: regla.id_empleado,
        limite_retardo_inicio: regla.limite_retardo_inicio,
        limite_retardo_fin: regla.limite_retardo_fin,
        activo: regla.activo // Control de Alta/Baja
      });
    return { data, error };
  }

  async deleteRegla(id: string) {
    const { error } = await this.supabase.from('reglas_empleados').delete().eq('id_empleado', id);
    return { error };
  }

  async getReglasDeTabla(nombreTabla: string) {
    return await this.supabase
      .from(nombreTabla)
      .select('*')
      .order('id_empleado', { ascending: true });
  }

  async saveEnTabla(nombreTabla: string, datos: any) {
    return await this.supabase
      .from(nombreTabla)
      .upsert(datos);
  }

  async deleteDeTabla(nombreTabla: string, id: string) {
    return await this.supabase
      .from(nombreTabla)
      .delete()
      .eq('id', id);
  }
}