import { Component, OnInit } from '@angular/core';
import * as XLSX from 'xlsx';
import moment from 'moment';
import { ReglasService } from '../../../services/reglas.service';
import { NotificacionService } from '../../../services/notificacion.service';

interface ResultadoEmpleado {
  nombre: string;
  asistencias: { [key: string]: string };      // Primera checada (Entrada)
  salidasDetectadas: { [key: string]: string }; // Última checada (Salida)
  retardos: { [key: string]: string };          // Horas de retardo
  paracaidismo: { [key: string]: string };      // Horas de paracaidismo
  faltasEspeciales: { [key: string]: 'ANTES_DE_HORA' | 'RETARDO' | 'PARACAIDISTA' | 'SALIDA_O_DESPUES' };
  reglaInicio: string;                          // limite_retardo_inicio de Supabase
  reglaFin: string;                             // limite_retardo_fin de Supabase
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
  showConfig: boolean = false;
  
  resultadosTabla: { [key: string]: ResultadoEmpleado } | null = null;
  diasParaTabla: string[] = [];

  // Variables de soporte para la iteración de llaves en el HTML y el Modal
  Object = Object;
  empleadoSeleccionado: ResultadoEmpleado | null = null;

  constructor(private reglasService: ReglasService, private notificaciones: NotificacionService) {}

  ngOnInit() { 
    this.cargarReglas(); 
  }

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
        const ws = workbook.Sheets[workbook.SheetNames[0]]; // Primera hoja dinámica
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        this.dataExcelMemoria = this.mapearExcel(rawData);
        this.notificaciones.mostrar('Excel cargado con éxito', 'exito');
      } catch (err) {
        this.notificaciones.mostrar('Error al leer Excel', 'error');
      }
    };
    reader.readAsBinaryString(file);
  }

  private mapearExcel(rawData: any[][]): any[] {
    if (rawData.length === 0) return [];
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
    if (!this.dataExcelMemoria || this.dataExcelMemoria.length === 0) {
      this.notificaciones.mostrar('No hay marcajes cargados en memoria', 'alerta');
      return;
    }

    const mInicio = moment(this.fechaInicioStr).startOf('day');
    const mFin = moment(this.fechaFinStr).endOf('day');
    this.diasParaTabla = [];
    
    // 1. Rango de días laborales (Lunes a Viernes)
    let current = mInicio.clone();
    while (current.isSameOrBefore(mFin)) {
      if (current.day() !== 0 && current.day() !== 6) {
        this.diasParaTabla.push(current.format('YYYY-MM-DD'));
      }
      current.add(1, 'days');
    }

    const mapaCompleto: { [key: string]: ResultadoEmpleado } = {};
    
    // 2. Inicialización de empleados activos desde reglas de Secundaria
    this.reglas.filter(r => r.activo).forEach(r => {
      const idKey = String(r.id_empleado).trim();
      mapaCompleto[idKey] = {
        nombre: r.nombre_completo, 
        asistencias: {}, 
        salidasDetectadas: {},
        retardos: {}, 
        paracaidismo: {},
        faltasEspeciales: {}, 
        reglaInicio: r.limite_retardo_inicio.substring(0, 5), 
        reglaFin: r.limite_retardo_fin.substring(0, 5)
      };
    });

    const toMins = (hStr: string) => {
      if (!hStr || !hStr.includes(':')) return 0;
      const [h, m] = hStr.split(':').map(Number);
      return (h * 60) + m;
    };

    // 3. Procesamiento Cronológico de Logs Lineales (Extracción de Extremos)
    this.dataExcelMemoria.forEach(reg => {
      const mFechaReg = moment(reg.fecha);
      
      if (mFechaReg.isSameOrAfter(mInicio) && mFechaReg.isSameOrBefore(mFin)) {
        const idEmpExcel = String(reg.empleado).trim();
        const emp = mapaCompleto[idEmpExcel];

        if (emp) {
          const fKey = mFechaReg.format('YYYY-MM-DD');
          const hMarcaje = mFechaReg.format('HH:mm');
          
          const minMarcaje = toMins(hMarcaje);
          const minEntradaBase = toMins(emp.reglaInicio);
          const minToleranciaFin = minEntradaBase + 30; // +30 Minutos de tolerancia
          const minSalidaJornada = toMins(emp.reglaFin);

          // 🔄 CASO A: Primer marcaje del día (Configuración de Entrada)
          if (!emp.asistencias[fKey]) {
            emp.asistencias[fKey] = hMarcaje;

            if (minMarcaje < minEntradaBase) {
              emp.faltasEspeciales[fKey] = 'ANTES_DE_HORA';
            }
            else if (minMarcaje >= minEntradaBase && minMarcaje <= minToleranciaFin) {
              emp.faltasEspeciales[fKey] = 'RETARDO';
              emp.retardos[fKey] = hMarcaje;
            }
            else if (minMarcaje > minToleranciaFin && minMarcaje <= minSalidaJornada) {
              emp.faltasEspeciales[fKey] = 'PARACAIDISTA';
              emp.paracaidismo[fKey] = hMarcaje;
            }
            else if (minMarcaje > minSalidaJornada) {
              emp.faltasEspeciales[fKey] = 'SALIDA_O_DESPUES';
              emp.salidasDetectadas[fKey] = hMarcaje; // Marcaje único tardío cuenta como salida
            }
          } 
          // 🔄 CASO B: Siguientes marcajes detectados (Evaluación de Salidas y ajuste de Extremos)
          else {
            const minExistente = toMins(emp.asistencias[fKey]);

            if (minMarcaje > minExistente) {
              emp.salidasDetectadas[fKey] = hMarcaje;
            } else {
              emp.salidasDetectadas[fKey] = emp.asistencias[fKey];
              emp.asistencias[fKey] = hMarcaje;

              // Re-evaluación automática con la entrada más temprana descubierta
              if (minMarcaje < minEntradaBase) {
                emp.faltasEspeciales[fKey] = 'ANTES_DE_HORA';
              } else if (minMarcaje >= minEntradaBase && minMarcaje <= minToleranciaFin) {
                emp.faltasEspeciales[fKey] = 'RETARDO';
                emp.retardos[fKey] = hMarcaje;
              }
            }
          }
        }
      }
    });

    // 4. Mapeo y Filtro Analítico de Incidencias
    const mapaFiltrado: { [key: string]: ResultadoEmpleado } = {};

    Object.keys(mapaCompleto).forEach(idEmpleado => {
      const emp = mapaCompleto[idEmpleado];
      let tieneIncidencia = false;

      for (const dia of this.diasParaTabla) {
        if (!emp.asistencias[dia]) {
          tieneIncidencia = true;
          break;
        }

        const condicion = emp.faltasEspeciales[dia];
        if (condicion === 'RETARDO' || condicion === 'PARACAIDISTA' || condicion === 'SALIDA_O_DESPUES') {
          tieneIncidencia = true;
          break;
        }

        if (emp.asistencias[dia] && !emp.salidasDetectadas[dia]) {
          tieneIncidencia = true;
          break;
        }
        if (emp.salidasDetectadas[dia] && toMins(emp.salidasDetectadas[dia]) < toMins(emp.reglaFin)) {
          tieneIncidencia = true;
          break;
        }
      }

      if (tieneIncidencia) {
        mapaFiltrado[idEmpleado] = emp;
      }
    });

    this.resultadosTabla = mapaFiltrado;
    
    const totalOcultados = Object.keys(mapaCompleto).length - Object.keys(mapaFiltrado).length;
    this.notificaciones.mostrar(
      `Evaluación lista. Se ocultaron ${totalOcultados} empleados con asistencia perfecta.`, 
      'exito'
    );
  }

  obtenerEstado(id: any, dia: string, tipo: 'F' | 'R' | 'L' | 'S'): string {
    const idStr = String(id);
    if (!this.resultadosTabla || !this.resultadosTabla[idStr]) return '';
    return this.obtenerEstadoDirecto(this.resultadosTabla[idStr], dia, tipo);
  }

  obtenerEstadoDirecto(d: any, dia: string, tipo: 'F' | 'R' | 'L' | 'S'): string {
    const condicion = d.faltasEspeciales[dia];
    
    const toMins = (hStr: string) => {
      if (!hStr || !hStr.includes(':')) return 0;
      const [h, m] = hStr.split(':').map(Number);
      return (h * 60) + m;
    };

    // --- COLUMNA 1: ASISTENCIA (F) ---
    if (tipo === 'F') {
      if (!d.asistencias[dia]) return 'F'; 
      if (condicion === 'SALIDA_O_DESPUES' && !d.salidasDetectadas[dia]) return 'F'; 
      if (condicion === 'ANTES_DE_HORA') return 'OK';
      return ''; 
    }

    // --- COLUMNA 2: RETARDO (R) ---
    if (tipo === 'R') {
      return d.retardos[dia] || ''; 
    }

    // --- COLUMNA 3: PARACAIDISMO (L) ---
    if (tipo === 'L') {
      return d.paracaidismo[dia] || ''; 
    }

    // --- COLUMNA 4: SALIDA (S) ---
    if (tipo === 'S') {
      if (!d.asistencias[dia]) return ''; 

      const horaSalidaRegistrada = d.salidasDetectadas[dia];
      
      if (!horaSalidaRegistrada) return 'SS';
      if (toMins(horaSalidaRegistrada) < toMins(d.reglaFin)) return 'SS';

      return ''; 
    }

    return '';
  }

  abrirModalEmpleado(empleado: ResultadoEmpleado) {
    this.empleadoSeleccionado = empleado;
  }

  cerrarModalEmpleado() {
    this.empleadoSeleccionado = null;
  }

  exportarExcelResultados() {
    if (!this.resultadosTabla || Object.keys(this.resultadosTabla).length === 0) {
      this.notificaciones.mostrar('No hay datos processedos para exportar', 'alerta');
      return;
    }

    const filasReporte: any[] = [];

    Object.keys(this.resultadosTabla).forEach(idEmp => {
      const emp = this.resultadosTabla![idEmp];
      
      this.diasParaTabla.forEach(dia => {
        filasReporte.push({
          'ID Empleado': idEmp,
          'Nombre Completo': emp.nombre,
          'Fecha': dia,
          'Falta (F)': this.obtenerEstadoDirecto(emp, dia, 'F'),
          'Retardo (R)': this.obtenerEstadoDirecto(emp, dia, 'R'),
          'Paracaidismo (L)': this.obtenerEstadoDirecto(emp, dia, 'L'),
          'Salida (S)': this.obtenerEstadoDirecto(emp, dia, 'S')
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(filasReporte);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Incidencias');
    XLSX.writeFile(wb, `Reporte_Incidencias_Secundaria_${this.fechaInicioStr}.xlsx`);
  }

  async guardarCambiosMasivos() {
    const reglasValidas = this.reglas.every(r => r.id_empleado && r.nombre_completo);
    
    if (!reglasValidas) {
      this.notificaciones.mostrar('Asegúrate de que todos los empleados tengan ID y Nombre', 'alerta');
      return;
    }

    this.notificaciones.mostrar('Guardando cambios en la base de datos...', 'alerta');

    try {
      const promesas = this.reglas.map(regla => 
        this.reglasService.saveEnTabla(this.NOMBRE_TABLA, regla)
      );

      await Promise.all(promesas);

      this.notificaciones.mostrar('Se han actualizado todos los registros correctamente', 'exito');
      this.cargarReglas(); 
      this.showConfig = false; 
      
    } catch (err) {
      console.error(err);
      this.notificaciones.mostrar('Hubo un error al guardar algunos registros', 'error');
    }
  }

  // --- VARIABLES Y MÉTODOS DEL CALENDARIO ---
  showCalendar: boolean = false;
  calendarTarget: 'inicio' | 'fin' = 'inicio';
  currentCalendarDate = moment(); 
  diasCalendario: any[] = [];
  semanas = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

  abrirCalendario(target: 'inicio' | 'fin') {
    this.calendarTarget = target;
    const fechaActual = target === 'inicio' ? this.fechaInicioStr : this.fechaFinStr;
    this.currentCalendarDate = moment(fechaActual);
    this.generarDias();
    this.showCalendar = true;
  }

  generarDias() {
    const startOfMonth = this.currentCalendarDate.clone().startOf('month');
    const endOfMonth = this.currentCalendarDate.clone().endOf('month');
    const startDay = startOfMonth.day();
    
    this.diasCalendario = [];

    for (let i = 0; i < startDay; i++) {
      this.diasCalendario.push(null);
    }

    for (let date = 1; date <= endOfMonth.date(); date++) {
      this.diasCalendario.push(date);
    }
  }

  cambiarMes(delta: number) {
    this.currentCalendarDate.add(delta, 'months');
    this.generarDias();
  }

  seleccionarFecha(dia: number) {
    if (!dia) return;
    const fechaSel = this.currentCalendarDate.clone().date(dia).format('YYYY-MM-DD');
    
    if (this.calendarTarget === 'inicio') this.fechaInicioStr = fechaSel;
    else this.fechaFinStr = fechaSel;
    
    this.showCalendar = false;
  }

  trackByFn(index: number): number {
    return index;
  }

  // --- VARIABLES Y MÉTODOS DEL TIMEPICKER ---
  showTimePicker: boolean = false;
  timeTarget: { registro: any, campo: 'inicio' | 'fin' } | null = null;
  horasDisponibles = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  minutosDisponibles = Array.from({ length: 60}, (_, i) => i.toString().padStart(2, '0'));

  horaSeleccionada: string = '08';
  minutoSeleccionado: string = '00';

  abrirTimePicker(regla: any, campo: 'inicio' | 'fin') {
    this.timeTarget = { registro: regla, campo };
    const valorActual = campo === 'inicio' ? regla.limite_retardo_inicio : regla.limite_retardo_fin;
    
    if (valorActual) {
      const [h, m] = valorActual.split(':');
      this.horaSeleccionada = h;
      this.minutoSeleccionado = m.substring(0, 2);
    }
    this.showTimePicker = true;
  }

  confirmarHora() {
    if (this.timeTarget) {
      const nuevaHora = `${this.horaSeleccionada}:${this.minutoSeleccionado}`;
      if (this.timeTarget.campo === 'inicio') {
        this.timeTarget.registro.limite_retardo_inicio = nuevaHora;
      } else {
        this.timeTarget.registro.limite_retardo_fin = nuevaHora;
      }
    }
    this.showTimePicker = false;
  }
}