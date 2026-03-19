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
  readonly NOMBRE_TABLA = 'asistencia_toluca_ofi';
  reglas: any[] = [];
  modoEdicion: boolean = false;
  fileName: string = 'Sin archivo seleccionado';
  
  fechaInicioStr: string = ''; 
  fechaFinStr: string = '';
  
  dataExcelMemoria: any[] = []; 
  resultadosTabla: { [key: string]: ResultadoEmpleado } | null = null;
  diasParaTabla: string[] = [];

  constructor(private reglasService: ReglasService, private notificaciones: NotificacionService) {}

  ngOnInit() { 
    this.cargarReglas();
    // Default: quincena actual
    this.fechaInicioStr = moment().startOf('month').format('YYYY-MM-DD');
    this.fechaFinStr = moment().format('YYYY-MM-DD');
  }

  async cargarReglas() {
    const { data } = await this.reglasService.getReglasDeTabla(this.NOMBRE_TABLA);
    this.reglas = data || [];
  }

  // --- MÓDULO 1: EXTRACTOR DE DATOS ---
  onFileChange(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const ws = workbook.Sheets[workbook.SheetNames[2]]; 
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        
        this.dataExcelMemoria = this.mapearExcelOficinas(rawData);
        this.notificaciones.mostrar(`Excel: ${this.dataExcelMemoria.length} marcajes listos`, 'exito');
      } catch (err) {
        this.notificaciones.mostrar('Error al leer Excel', 'error');
      }
    };
    reader.readAsBinaryString(file);
  }

  private mapearExcelOficinas(rawData: any[][]): any[] {
    let marcajes: any[] = [];
    let empleadoActual: string | null = null;
    let filaIdIdx: number = -1;

    // Fila 4 para mapeo de días (Índice 3)
    const filaDias = rawData[3] || [];
    const mapaColumnasDias: { [col: number]: number } = {};
    filaDias.forEach((celda, idx) => {
      const numDia = parseInt(celda?.toString().trim());
      if (!isNaN(numDia)) mapaColumnasDias[idx] = numDia;
    });

    // Usamos el mes/año del selector del usuario
    const mBase = moment(this.fechaInicioStr);
    const anio = mBase.year();
    const mes = mBase.month();

    for (let i = 0; i < rawData.length; i++) {
      const fila = rawData[i];
      if (fila[0]?.toString().trim().toUpperCase() === "ID:") {
        empleadoActual = fila[4]?.toString().trim(); // ID en Col E
        filaIdIdx = i;
        continue;
      }

      if (empleadoActual && i === filaIdIdx + 1) {
        fila.forEach((celda, colIdx) => {
          const valor = celda?.toString().trim();
          if (valor && /^\d{1,2}:\d{2}/.test(valor)) {
            const diaDelExcel = mapaColumnasDias[colIdx];
            if (diaDelExcel) {
              // Formateamos la fecha EXACTAMENTE como YYYY-MM-DD para evitar fallos de comparación
              const fechaStr = moment().set({ year: anio, month: mes, date: diaDelExcel }).format('YYYY-MM-DD');
              const horaLimpia = valor.substring(0, 5);

              marcajes.push({ id: empleadoActual, fecha: fechaStr, hora: horaLimpia });
            }
          }
        });
        empleadoActual = null;
      }
    }
    return marcajes;
  }

  // --- MÓDULO 2: ANALIZADOR F-R-L (SÓLO POR ID) ---
  generarProcesamiento() {
    if (this.dataExcelMemoria.length === 0) return;

    const mInicio = moment(this.fechaInicioStr);
    const mFin = moment(this.fechaFinStr);
    this.diasParaTabla = [];
    
    // Generamos el calendario de comparación (ISO format)
    let aux = mInicio.clone();
    while (aux.isSameOrBefore(mFin)) {
      if (aux.day() !== 0 && aux.day() !== 6) {
        this.diasParaTabla.push(aux.format('YYYY-MM-DD'));
      }
      aux.add(1, 'days');
    }

    const mapa: { [key: string]: ResultadoEmpleado } = {};

    // Inicializamos con los empleados de la DB
    this.reglas.filter(r => r.activo).forEach(r => {
      // Forzamos el ID a string para evitar errores de tipo
      const idKey = String(r.id_empleado).trim();
      mapa[idKey] = {
        nombre: r.nombre_completo,
        asistencias: {}, retardos: {}, limites: {},
        reglaInicio: r.limite_retardo_inicio.substring(0, 5), // "08:00"
        reglaFin: r.limite_retardo_fin.substring(0, 5)       // "08:15"
      };
    });

    // PROCESO DE CRUCE: SÓLO ID
    this.dataExcelMemoria.forEach(reg => {
      const idExcel = String(reg.id).trim();
      const emp = mapa[idExcel];

      if (emp) {
        const fKey = reg.fecha; // Ya viene en YYYY-MM-DD
        const hMarcaje = reg.hora; // "12:48"

        // Si el día está en el rango solicitado
        if (this.diasParaTabla.includes(fKey)) {
          if (!emp.asistencias[fKey]) {
            emp.asistencias[fKey] = hMarcaje;
            
            // Lógica F-R-L
            if (hMarcaje > emp.reglaInicio && hMarcaje <= emp.reglaFin) {
              emp.retardos[fKey] = hMarcaje;
            } else if (hMarcaje > emp.reglaFin) {
              emp.limites[fKey] = hMarcaje;
            }
          }
        }
      }
    });

    this.resultadosTabla = mapa;
    this.notificaciones.mostrar('Análisis F-R-L completado', 'exito');
  }

  obtenerEstado(id: any, dia: string, tipo: 'F' | 'R' | 'L'): string {
    const idStr = String(id).trim();
    if (!this.resultadosTabla || !this.resultadosTabla[idStr]) return '';
    const d = this.resultadosTabla[idStr];

    if (tipo === 'F') return !d.asistencias[dia] ? 'Si' : '';
    if (tipo === 'R') return d.retardos[dia] || '';
    if (tipo === 'L') return d.limites[dia] || '';
    return '';
  }

  // --- RESTO DE FUNCIONES CRUD (COPIAR TAL CUAL TENÍAS) ---
  async agregarRegla() {
    const nueva = { id_empleado: '', nombre_completo: '', limite_retardo_inicio: "08:00", limite_retardo_fin: "08:15", activo: true };
    this.reglas.unshift(nueva);
  }

  async actualizarRegla(r: any) {
    await this.reglasService.saveEnTabla(this.NOMBRE_TABLA, r);
    this.cargarReglas();
  }

  async eliminarRegla(id: string) {
    if (confirm("¿Eliminar?")) {
      await this.reglasService.deleteDeTabla(this.NOMBRE_TABLA, id);
      this.cargarReglas();
    }
  }

  exportarExcelResultados() {
    const element = document.getElementById('tabla-ofi-resultados');
    const ws = XLSX.utils.table_to_sheet(element);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, `Asistencia_Oficinas.xlsx`);
  }
}