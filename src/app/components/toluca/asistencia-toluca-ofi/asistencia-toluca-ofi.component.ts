import { Component, OnInit } from '@angular/core';
import * as XLSX from 'xlsx';
import * as moment from 'moment';
import { ReglasService } from '../../../services/reglas.service';
import { NotificacionService } from '../../../services/notificacion.service';

interface ResultadoEmpleado {
  nombre: string;
  asistencias: { [key: string]: string };
  retardos: { [key: string]: string };
  limites: { [key: string]: string };
  reglaInicio: string;
  reglaFin: string;
}

@Component({
  selector: 'app-asistencia-toluca-ofi',
  templateUrl: './asistencia-toluca-ofi.component.html',
  styleUrls: ['./asistencia-toluca-ofi.component.css']
})
export class AsistenciaTolucaOfiComponent implements OnInit {
  readonly NOMBRE_TABLA = 'asistencia_toluca_ofi'; // Tabla exclusiva Oficinas
  reglas: any[] = [];
  modoEdicion: boolean = false;
  fileName: string = 'Sin archivo seleccionado';
  
  // Variables corregidas para eliminar errores TS2339
  fechaInicioStr: string = '2026-02-01'; 
  fechaFinStr: string = '2026-02-15';
  
  dataExcelMemoria: any[] = []; 
  resultadosTabla: { [key: string]: ResultadoEmpleado } | null = null;
  diasParaTabla: string[] = [];

  constructor(private reglasService: ReglasService, private notificaciones: NotificacionService) {}

  ngOnInit() { this.cargarReglas(); }

  // --- CRUD GRÁFICO (SUPABASE) ---
  async cargarReglas() {
    const { data } = await this.reglasService.getReglasDeTabla(this.NOMBRE_TABLA);
    this.reglas = data || [];
  }

  async agregarRegla() {
    const nueva = { id_empleado: '', nombre_completo: '', limite_retardo_inicio: "08:00", limite_retardo_fin: "08:15", activo: true };
    this.reglas.unshift(nueva);
  }

  async actualizarRegla(r: any) {
    await this.reglasService.saveEnTabla(this.NOMBRE_TABLA, r);
    this.notificaciones.mostrar('Configuración de Oficina guardada', 'exito');
    this.cargarReglas();
  }

  async eliminarRegla(id: string) {
    if (confirm("¿Eliminar empleado de oficinas?")) {
      await this.reglasService.deleteDeTabla(this.NOMBRE_TABLA, id);
      this.cargarReglas();
    }
  }

  // --- PROCESAMIENTO EXCEL (NETLIFY / LOCAL) ---
  onFileChange(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const ws = workbook.Sheets["Reporte de Asistencia"]; 
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        
        // Lógica Oficinas: ID en Col E (4) y marcajes en fila + 1
        this.dataExcelMemoria = this.mapearExcelOficinas(rawData);
        this.notificaciones.mostrar('Excel procesado con éxito', 'exito');
      } catch (err) {
        this.notificaciones.mostrar('Error al leer el reporte binario', 'error');
      }
    };
    reader.readAsBinaryString(file);
  }

  private mapearExcelOficinas(rawData: any[][]): any[] {
    let marcajes: any[] = [];
    let empleadoActual: string | null = null;
    let filaIdxId: number = -1;
    const baseDate = moment(this.fechaInicioStr);

    for (let i = 0; i < rawData.length; i++) {
      const fila = rawData[i];
      if (fila[0]?.toString().trim().toUpperCase() === "ID:") {
        empleadoActual = fila[4]?.toString().trim(); // Extrae de Columna E
        filaIdxId = i;
        continue;
      }
      if (empleadoActual && i === filaIdxId + 1) {
        for (let col = 0; col <= 20; col++) {
          const celda = fila[col]?.toString().trim();
          if (celda && celda.includes(':')) {
            const horaStr = celda.substring(0, 5);
            const diaMes = 7 + col; // Mapeo según estructura Oficinas
            const fechaFull = baseDate.clone().date(diaMes).set({
              hour: parseInt(horaStr.split(':')[0]),
              minute: parseInt(horaStr.split(':')[1])
            });
            marcajes.push({ empleado: empleadoActual, fecha: fechaFull.toDate() });
          }
        }
        empleadoActual = null;
      }
    }
    return marcajes;
  }

  generarProcesamiento() {
    if (this.dataExcelMemoria.length === 0) return;
    const mInicio = moment(this.fechaInicioStr).startOf('day');
    const mFin = moment(this.fechaFinStr).endOf('day');
    this.diasParaTabla = [];
    
    let current = mInicio.clone();
    while (current.isSameOrBefore(mFin)) {
      if (current.day() !== 0 && current.day() !== 6) this.diasParaTabla.push(current.format('YYYY-MM-DD'));
      current.add(1, 'days');
    }

    const mapa: { [key: string]: ResultadoEmpleado } = {};
    this.reglas.filter(r => r.activo).forEach(r => {
      mapa[r.id_empleado] = {
        nombre: r.nombre_completo, asistencias: {}, retardos: {}, limites: {},
        reglaInicio: r.limite_retardo_inicio, reglaFin: r.limite_retardo_fin
      };
    });

    this.dataExcelMemoria.forEach(reg => {
      const mFechaReg = moment(reg.fecha);
      if (mFechaReg.isSameOrAfter(mInicio) && mFechaReg.isSameOrBefore(mFin)) {
        const emp = mapa[reg.empleado];
        if (emp) {
          const fKey = mFechaReg.format('YYYY-MM-DD');
          const hMarcaje = mFechaReg.format('HH:mm');
          if (!emp.asistencias[fKey]) {
            emp.asistencias[fKey] = hMarcaje;
            if (hMarcaje > emp.reglaInicio && hMarcaje <= emp.reglaFin) emp.retardos[fKey] = hMarcaje;
            else if (hMarcaje > emp.reglaFin) emp.limites[fKey] = hMarcaje;
          }
        }
      }
    });

    this.resultadosTabla = mapa;
    this.notificaciones.mostrar('Reporte de Oficinas generado', 'exito');
  }

  obtenerEstado(id: any, dia: string, tipo: 'F' | 'R' | 'L'): string {
    const idStr = String(id);
    if (!this.resultadosTabla || !this.resultadosTabla[idStr]) return '';
    const d = this.resultadosTabla[idStr];
    if (tipo === 'F') return !d.asistencias[dia] ? 'Si' : '';
    if (tipo === 'R') return d.retardos[dia] || '';
    if (tipo === 'L') return d.limites[dia] || '';
    return '';
  }

  // --- EXPORTACIÓN ---
  exportarExcelResultados() {
    const element = document.getElementById('tabla-ofi-resultados');
    const ws = XLSX.utils.table_to_sheet(element);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Oficinas');
    XLSX.writeFile(wb, `Asistencia_Oficinas_${this.fechaInicioStr}.xlsx`);
  }
}