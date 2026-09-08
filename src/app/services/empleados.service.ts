import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

export interface Empleado {
  id?: string;
  id_empleado: string;
  nombre_completo: string;
  plantel: string;       // 'toluca' | 'calimaya' | 'aeropuerto'
  sub_sede?: string;      // 'secundaria' | 'oficinas' | 'hacienda' | 'esquina'
  puesto?: string;
  departamento?: string;
  activo: boolean;
  odoo_id?: number | null;
  created_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EmpleadosService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  /**
   * Obtiene la lista de empleados filtrada por plantel y opcionalmente por sub-sede
   */
  async obtenerEmpleadosPorPlantel(plantel: string, subSede?: string): Promise<Empleado[]> {
    let query = this.supabase
      .from('empleados')
      .select('*')
      .eq('plantel', plantel.toLowerCase())
      .order('nombre_completo', { ascending: true });

    if (subSede) {
      query = query.eq('sub_sede', subSede.toLowerCase());
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as Empleado[]) || [];
  }

  /**
   * Obtiene un empleado por su ID único
   */
  async obtenerEmpleadoPorId(id: string): Promise<Empleado | null> {
    const { data, error } = await this.supabase
      .from('empleados')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Empleado;
  }

  /**
   * Crea o registra un nuevo empleado asociado a un plantel
   */
  async crearEmpleado(empleado: Empleado): Promise<Empleado> {
    const { data, error } = await this.supabase
      .from('empleados')
      .insert([empleado])
      .select()
      .single();

    if (error) throw error;
    return data as Empleado;
  }

  /**
   * Actualiza los datos de un empleado
   */
  async actualizarEmpleado(id: string, cambios: Partial<Empleado>): Promise<Empleado> {
    const { data, error } = await this.supabase
      .from('empleados')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Empleado;
  }

  /**
   * Alterna el estado activo/inactivo (switch)
   */
  async alternarEstadoActivo(id: string, activo: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('empleados')
      .update({ activo })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Sincronización masiva desde Odoo para un plantel
   */
  async sincronizarConOdoo(plantel: string, empleadosOdoo: Empleado[]): Promise<any> {
    const { data, error } = await this.supabase
      .from('empleados')
      .upsert(empleadosOdoo, { onConflict: 'id_empleado,plantel' })
      .select();

    if (error) throw error;
    return data;
  }
}