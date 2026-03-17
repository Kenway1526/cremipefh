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
  selector: 'app-asistencia-toluca-sec',
  templateUrl: './asistencia-toluca-sec.component.html',
  styleUrls: ['./asistencia-toluca-sec.component.css']
})
export class AsistenciaTolucaSecComponent implements OnInit {
  readonly NOMBRE_TABLA = 'asistencia_toluca_sec';
  reglas: any[] = [];
  modoEdicion: boolean = false;
  fileName: string = 'Sin archivo seleccionado';
  fechaInicioStr: string = '2026-02-01';
  fechaFinStr: string = '2026-02-15';
  dataExcelMemoria: any[] = [];
  
  resultadosTabla: { [key: string]: ResultadoEmpleado } | null = null;
  diasParaTabla: string[] = [];

  constructor(private reglasService: ReglasService, private notificaciones: NotificacionService) {}

  ngOnInit() { this.cargarReglas(); }

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
    this.notificaciones.mostrar('Cambios guardados', 'exito');
    this.cargarReglas();
  }

  async eliminarRegla(id: string) {
    if (confirm("¿Eliminar empleado?")) {
      await this.reglasService.deleteDeTabla(this.NOMBRE_TABLA, id);
      this.cargarReglas();
    }
  }

  onFileChange(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        this.dataExcelMemoria = this.mapearExcel(rawData);
        this.notificaciones.mostrar('Excel cargado', 'exito');
      } catch (err) {
        this.notificaciones.mostrar('Error al leer Excel', 'error');
      }
    };
    reader.readAsBinaryString(file);
  }

  private mapearExcel(rawData: any[][]): any[] {
    const headers = rawData[0];
    const nIdx = headers.indexOf('Name');
    const dIdx = headers.indexOf('Date/Time');
    return rawData.slice(1).map(row => {
      const p = moment(row[dIdx], "DD/MM/YYYY hh:mm:ss a");
      return (row[nIdx] && p.isValid()) ? { 
        empleado: row[nIdx].toString().trim(), 
        fecha: p.toDate() 
      } : null;
    }).filter(i => i !== null);
  }

  generarProcesamiento() {
    if (this.dataExcelMemoria.length === 0) return;

    const mInicio = moment(this.fechaInicioStr).startOf('day');
    const mFin = moment(this.fechaFinStr).endOf('day');
    this.diasParaTabla = [];
    
    let current = mInicio.clone();
    while (current.isSameOrBefore(mFin)) {
      if (current.day() !== 0 && current.day() !== 6) {
        this.diasParaTabla.push(current.format('YYYY-MM-DD'));
      }
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
    this.notificaciones.mostrar('Rango evaluado con éxito', 'exito');
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

  exportarExcelResultados() {
    const element = document.getElementById('tabla-sec-resultados');
    const ws = XLSX.utils.table_to_sheet(element);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, `Asistencia_${this.fechaInicioStr}.xlsx`);
  }
}