import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

export interface ReglaEmpleado {
  id?: string;
  id_empleado: string;
  numero_empleado?: string;
  nombre_completo: string;
  limite_retardo_inicio: string;
  limite_retardo_fin: string;
  activo: boolean;
  plantel?: string;
  sub_sede?: string;
}

@Injectable({ providedIn: 'root' })
export class ReglasService {
  private supabase: SupabaseClient;

  // Mapa de nombres de tablas existentes en Supabase
  private tablasSedes: Record<string, string> = {
    'toluca_secundaria': 'asistencia_toluca_sec',
    'toluca_oficinas': 'asistencia_toluca_ofi',
    'calimaya_calimaya': 'asistencia_calimaya',
    'aeropuerto_hacienda': 'asistencia_aero_hac',
    'aeropuerto_esquina': 'asistencia_aero_esq'
  };

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // --- MÉTODOS DINÁMICOS (NUEVA ARQUITECTURA) ---
  public resolverNombreTabla(plantel: string, subSede: string): string {
    const pLimpio = (plantel || '').trim().toLowerCase();
    const sLimpio = (subSede || '').trim().toLowerCase();
    const key = `${pLimpio}_${sLimpio}`;
    
    // Si está en el diccionario lo usa, de lo contrario construye el nombre limpiando espacios
    return this.tablasSedes[key] || `asistencia_${pLimpio}_${sLimpio}`.replace(/\s+/g, '_');
  }

  async getReglasPorSede(plantel: string, subSede: string) {
    const nombreTabla = this.resolverNombreTabla(plantel, subSede);
    const { data, error } = await this.supabase
      .from(nombreTabla)
      .select('*')
      .order('id_empleado', { ascending: true });
    return { data: (data as ReglaEmpleado[]) || [], error };
  }

  async guardarReglasMasivas(plantel: string, subSede: string, reglas: ReglaEmpleado[]) {
    const nombreTabla = this.resolverNombreTabla(plantel, subSede);

    // Separar los registros existentes de los nuevos
    const existentes = reglas.filter(r => !!r.id);
    const nuevos = reglas.filter(r => !r.id);

    // 1. Actualizar los que ya existen (tienen id UUID de Supabase)
    if (existentes.length > 0) {
      const payloadUpdate = existentes.map(r => ({
        id: r.id,
        id_empleado: String(r.id_empleado || '').trim(),
        numero_empleado: r.numero_empleado ? String(r.numero_empleado).trim() : null,
        nombre_completo: String(r.nombre_completo || '').trim().toUpperCase(),
        limite_retardo_inicio: r.limite_retardo_inicio,
        limite_retardo_fin: r.limite_retardo_fin,
        activo: Boolean(r.activo)
      }));

      const { error: errUpdate } = await this.supabase
        .from(nombreTabla)
        .upsert(payloadUpdate); // Como todos traen su 'id', actualiza sobre la misma fila sin duplicar

      if (errUpdate) return { error: errUpdate };
    }

    // 2. Insertar los nuevos (no traen id)
    if (nuevos.length > 0) {
      const payloadInsert = nuevos.map(r => ({
        id_empleado: String(r.id_empleado || '').trim(),
        numero_empleado: r.numero_empleado ? String(r.numero_empleado).trim() : null,
        nombre_completo: String(r.nombre_completo || '').trim().toUpperCase(),
        limite_retardo_inicio: r.limite_retardo_inicio,
        limite_retardo_fin: r.limite_retardo_fin,
        activo: Boolean(r.activo)
      }));

      const { error: errInsert } = await this.supabase
        .from(nombreTabla)
        .insert(payloadInsert); // Genera su nuevo UUID automáticamente

      if (errInsert) return { error: errInsert };
    }

    return { error: null };
  }

  async saveRegla(plantel: string, subSede: string, regla: ReglaEmpleado) {
    const nombreTabla = this.resolverNombreTabla(plantel, subSede);
    return await this.supabase
      .from(nombreTabla)
      .upsert(regla, { onConflict: 'id_empleado' });
  }

  async deleteRegla(plantel: string, subSede: string, idEmpleado: string) {
    const nombreTabla = this.resolverNombreTabla(plantel, subSede);
    return await this.supabase
      .from(nombreTabla)
      .delete()
      .eq('id_empleado', idEmpleado);
  }

  // --- MÉTODOS COMPATIBILIDAD LEGACY (PREVIENEN ERRORES TS EN COMPONENTES ANTERIORES) ---
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
      .eq('id_empleado', id);
  }
}