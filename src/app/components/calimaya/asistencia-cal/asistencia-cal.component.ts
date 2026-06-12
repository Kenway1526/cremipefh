import { Component, OnInit } from '@angular/core';
import * as XLSX from 'xlsx';
import moment from 'moment';
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
  selector: 'app-asistencia-cal',
  templateUrl: './asistencia-cal.component.html',
  styleUrls: ['./asistencia-cal.component.css']
})
export class AsistenciaCalComponent implements OnInit {
  // 1. CAMBIAR EL NOMBRE DE LA TABLA SEGÚN SUPABASE
  readonly NOMBRE_TABLA = 'asistencia_calimaya'; 
  
  reglas: any[] = [];
  showConfig: boolean = false;
  fileName: string = '';
  fechaInicioStr: string = ''; 
  fechaFinStr: string = '';
  dataExcelMemoria: any[] = []; 
  resultadosTabla: { [key: string]: any } | null = null;
  diasParaTabla: string[] = [];

  constructor(private reglasService: ReglasService, private notificaciones: NotificacionService) {}

  ngOnInit() {
    this.cargarReglas();
    // Default actual
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
          
          this.dataExcelMemoria = this.mapearExcelCalimaya(rawData);
          this.notificaciones.mostrar(`Excel: ${this.dataExcelMemoria.length} marcajes listos`, 'exito');
        } catch (err) {
          this.notificaciones.mostrar('Error al leer Excel', 'error');
        }
      };
      reader.readAsBinaryString(file);
    }
  // ... (Reutiliza las mismas funciones que Oficinas: cargarReglas, actualizarRegla, eliminarRegla) ...

  // 2. EL MOTOR DE LECTURA (Es el mismo que Oficinas)
  private mapearExcelCalimaya(rawData: any[][]): any[] {
    let marcajes: any[] = [];
    let empleadoActual: string | null = null;
    let filaIdIdx: number = -1;

    const filaDias = rawData[3] || [];
    const mapaColumnasDias: { [col: number]: number } = {};
    filaDias.forEach((celda, idx) => {
      const numDia = parseInt(celda?.toString().trim());
      if (!isNaN(numDia)) mapaColumnasDias[idx] = numDia;
    });

    const mBase = moment(this.fechaInicioStr);
    const anio = mBase.year();
    const mes = mBase.month();

    for (let i = 0; i < rawData.length; i++) {
      const fila = rawData[i];
      // Buscamos ID: en columna A, valor en E
      if (fila[0]?.toString().trim().toUpperCase() === "ID:") {
        empleadoActual = String(fila[4]).trim();
        filaIdIdx = i;
        continue;
      }
      if (empleadoActual && i === filaIdIdx + 1) {
        fila.forEach((celda, colIdx) => {
          const valor = celda?.toString().trim();
          if (valor && /^\d{1,2}:\d{2}/.test(valor)) {
            const diaExcel = mapaColumnasDias[colIdx];
            if (diaExcel) {
              const fechaStr = moment().set({ year: anio, month: mes, date: diaExcel }).format('YYYY-MM-DD');
              marcajes.push({ id: empleadoActual, fecha: fechaStr, hora: valor.substring(0, 5) });
            }
          }
        });
        empleadoActual = null;
      }
    }
    return marcajes;
  }
  
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
    this.notificaciones.mostrar('Agregado', 'exito');
    this.reglas.unshift(nueva);
  }

  async actualizarRegla(r: any) {
    await this.reglasService.saveEnTabla(this.NOMBRE_TABLA, r);
    this.notificaciones.mostrar('Cambios guardados', 'exito');
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

    async guardarCambiosMasivos() {
      // 1. Validar que no haya campos vacíos críticos
      const reglasValidas = this.reglas.every(r => r.id_empleado && r.nombre_completo);
      
      if (!reglasValidas) {
        this.notificaciones.mostrar('Asegúrate de que todos los empleados tengan ID y Nombre', 'alerta');
        return;
      }

      this.notificaciones.mostrar('Guardando cambios en la base de datos...', 'alerta');

      try {
        // 2. Ejecutar todas las actualizaciones en paralelo
        const promesas = this.reglas.map(regla => 
          this.reglasService.saveEnTabla(this.NOMBRE_TABLA, regla)
        );

        await Promise.all(promesas);

        // 3. Feedback de éxito y recarga
        this.notificaciones.mostrar('Se han actualizado todos los registros correctamente', 'exito');
        this.cargarReglas(); // Refresca la lista desde la DB
        this.showConfig = false; // Opcional: cierra el panel al terminar
        
      } catch (err) {
        console.error(err);
        this.notificaciones.mostrar('Hubo un error al guardar algunos registros', 'error');
      }
    }

    // --- VARIABLES PARA EL CALENDARIO PERSONALIZADO ---
  showCalendar: boolean = false;
  calendarTarget: 'inicio' | 'fin' = 'inicio';
  currentCalendarDate = moment(); // Mes que se visualiza en el modal
  diasCalendario: any[] = [];
  semanas = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

  // Abre el modal y prepara el mes
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

    // Relleno de días vacíos del mes anterior
    for (let i = 0; i < startDay; i++) {
      this.diasCalendario.push(null);
    }

    // Días del mes actual
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

  // --- VARIABLES PARA EL TIMEPICKER ---
  showTimePicker: boolean = false;
  timeTarget: { registro: any, campo: 'inicio' | 'fin' } | null = null;
  horasDisponibles = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  minutosDisponibles = Array.from({ length: 60}, (_, i) => i.toString().padStart(2, '0'));//['00', '01', '05', '06', '10', '11', '15', '16', '20', '21', '25', '26', '30', '31', '35', '36', '40', '41', '45', '46', '50', '51', '55', '56',];

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