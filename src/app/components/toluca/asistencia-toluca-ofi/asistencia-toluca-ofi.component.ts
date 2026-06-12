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
  faltasEspeciales: { [key: string]: 'ANTES_DE_HORA' | 'ENTRE_ENTRADA_SALIDA' | 'SALIDA_O_DESPUES' };
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
  showConfig: boolean = false;

  fechaInicioStr: string = ''; 
  fechaFinStr: string = '';
  
  dataExcelMemoria: any[] = []; 
  resultadosTabla: { [key: string]: ResultadoEmpleado } | null = null;
  diasParaTabla: string[] = [];

  // Soporte para iteración de llaves en el HTML y el Modal
  Object = Object;
  empleadoSeleccionado: ResultadoEmpleado | null = null;

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

  // --- MÓDULO 1: RECEPTOR DEL ENDPOINT DE NETLIFY ---
  // Almacena la respuesta del JSON generado por tu función Lambda en 'dataExcelMemoria'
  asignarDatosNetlify(resultadosJson: any[]) {
    this.dataExcelMemoria = resultadosJson;
    this.notificaciones.mostrar(`Servidor: ${this.dataExcelMemoria.length} marcajes cargados`, 'exito');
  }

  // En caso de que también uses lectura local en este componente, procesamos el archivo base64
  onFileChange(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const sheet = workbook.Sheets["Reporte de Asistencia"]; 
        const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        
        // Mapeo interno clonando la lógica exacta de tu handler de Netlify
        const resultados: any[] = [];
        let empleadoActual = null;

        for (let i = 0; i < rawData.length; i++) {
          const fila = rawData[i];
          if (fila[0] && fila[0].toString().trim().toUpperCase() === "ID:") {
            empleadoActual = {
              id_excel: fila[4]?.toString().trim(), 
              nombre_excel: fila[10]?.toString().trim(), 
              filaIdx: i
            };
            continue;
          }
          if (empleadoActual && i === empleadoActual.filaIdx + 1) {
            for (let col = 0; col <= 20; col++) {
              const celda = fila[col]?.toString().trim();
              if (celda && celda.includes(':')) {
                resultados.push({
                  id_empleado: empleadoActual.id_excel,
                  nombre: empleadoActual.nombre_excel,
                  dia: 7 + col, 
                  entrada: celda.substring(0, 5) 
                });
              }
            }
            empleadoActual = null;
          }
        }
        this.dataExcelMemoria = resultados;
        this.notificaciones.mostrar(`Excel Local: ${this.dataExcelMemoria.length} marcajes listos`, 'exito');
      } catch (err) {
        this.notificaciones.mostrar('Error al leer Excel', 'error');
      }
    };
    reader.readAsBinaryString(file);
  }

  // --- MÓDULO 2: ANALIZADOR ANALÍTICO CON INTERFAZ ADAPTADA ---
  generarProcesamiento() {
    if (this.dataExcelMemoria.length === 0) return;

    const mInicio = moment(this.fechaInicioStr).startOf('day');
    const mFin = moment(this.fechaFinStr).endOf('day');
    this.diasParaTabla = [];
    
    // Generamos el rango de días del periodo excluyendo fines de semana
    let aux = mInicio.clone();
    while (aux.isSameOrBefore(mFin)) {
      if (aux.day() !== 0 && aux.day() !== 6) {
        this.diasParaTabla.push(aux.format('YYYY-MM-DD'));
      }
      aux.add(1, 'days');
    }

    const mapaCompleto: { [key: string]: ResultadoEmpleado } = {};

    // Inicializamos el mapa con los empleados activos de tu base de datos de Oficinas
    this.reglas.filter(r => r.activo).forEach(r => {
      const idKey = String(r.id_empleado).trim();
      mapaCompleto[idKey] = {
        nombre: r.nombre_completo,
        asistencias: {}, 
        retardos: {}, 
        limites: {},
        faltasEspeciales: {}, 
        reglaInicio: r.limite_retardo_inicio.substring(0, 5), // "08:00"
        reglaFin: r.limite_retardo_fin.substring(0, 5)       // "08:15"
      };
    });

    // CONSTANTE HORA DE SALIDA OFICINAS
    const HORA_SALIDA_OFI = "16:00"; 
    const mBase = moment(this.fechaInicioStr);

    // PROCESO DE CRUCE DE DATOS ADAPTADO AL PARSER DE TU MOTOR
    this.dataExcelMemoria.forEach(reg => {
      const idExcel = String(reg.id_empleado).trim();
      const emp = mapaCompleto[idExcel];

      if (emp) {
        // Reconstruimos la fecha en base al número de día que arrojó tu Netlify (reg.dia)
        const fechaConstruidaStr = mBase.clone().date(reg.dia).format('YYYY-MM-DD');
        const hMarcaje = reg.entrada; // Tu motor lo nombra "entrada" ("08:05")

        // Verificamos si la fecha construida cae dentro del rango seleccionado por el usuario
        if (this.diasParaTabla.includes(fechaConstruidaStr)) {
          if (!emp.asistencias[fechaConstruidaStr]) {
            emp.asistencias[fechaConstruidaStr] = hMarcaje;
            
            // ESCENARIO A: Checó antes de la hora oficial de entrada
            if (hMarcaje < emp.reglaInicio) {
              emp.faltasEspeciales[fechaConstruidaStr] = 'ANTES_DE_HORA';
            }
            // ESCENARIO B: Checó entre la Entrada y la Salida de Oficinas
            else if (hMarcaje >= emp.reglaInicio && hMarcaje < HORA_SALIDA_OFI) {
              emp.faltasEspeciales[fechaConstruidaStr] = 'ENTRE_ENTRADA_SALIDA';
              
              if (hMarcaje <= emp.reglaFin) {
                emp.retardos[fechaConstruidaStr] = hMarcaje; // Columna R
              } else {
                emp.limites[fechaConstruidaStr] = hMarcaje;  // Columna L
              }
            }
            // ESCENARIO C: Checó directo a la hora de salida o después
            else if (hMarcaje >= HORA_SALIDA_OFI) {
              emp.faltasEspeciales[fechaConstruidaStr] = 'SALIDA_O_DESPUES';
              emp.limites[fechaConstruidaStr] = hMarcaje; // Columna L para auditar fraude/omisión
            }
          }
        }
      }
    });

    // FILTRO ANALÍTICO: Eliminar renglones redundantes con asistencia perfecta (todos NA)
    const mapaFiltrado: { [key: string]: ResultadoEmpleado } = {};

    Object.keys(mapaCompleto).forEach(idEmpleado => {
      const emp = mapaCompleto[idEmpleado];
      let tieneIncidencia = false;

      for (const dia of this.diasParaTabla) {
        // Si un día laboral no tiene marcajes -> Falta absoluta (F), requiere atención
        if (!emp.asistencias[dia]) {
          tieneIncidencia = true;
          break;
        }

        const condicion = emp.faltasEspeciales[dia];
        // Si el empleado llegó tarde o solo vino a la salida -> Requiere atención
        if (condicion === 'ENTRE_ENTRADA_SALIDA' || condicion === 'SALIDA_O_DESPUES') {
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
      `Análisis completado.`, 
      'exito'
    );
  }

  // Compatibilidad con firmas antiguas o herencia de clases
  obtenerEstado(id: any, dia: string, tipo: 'F' | 'R' | 'L'): string {
    const idStr = String(id).trim();
    if (!this.resultadosTabla || !this.resultadosTabla[idStr]) return '';
    return this.obtenerEstadoDirecto(this.resultadosTabla[idStr], dia, tipo);
  }

  // Extractor de estados analíticos unificado para Tarjetas y el Modal de visualización vertical
  obtenerEstadoDirecto(d: ResultadoEmpleado, dia: string, tipo: 'F' | 'R' | 'L'): string {
    if (tipo === 'F') {
      if (!d.asistencias[dia]) return 'F'; 
      const condicion = d.faltasEspeciales[dia];
      if (condicion === 'ANTES_DE_HORA') return 'NA';
      return ''; 
    }
    if (tipo === 'R') return d.retardos[dia] || '';
    if (tipo === 'L') return d.limites[dia] || '';
    return '';
  }

  abrirModalEmpleado(empleado: ResultadoEmpleado) {
    this.empleadoSeleccionado = empleado;
  }

  cerrarModalEmpleado() {
    this.empleadoSeleccionado = null;
  }

  // Genera la descarga estructurada en memoria sin depender de tablas del DOM horizontal
  exportarExcelResultados() {
    if (!this.resultadosTabla || Object.keys(this.resultadosTabla).length === 0) {
      this.notificaciones.mostrar('No hay datos procesados para exportar', 'alerta');
      return;
    }

    const filasReporte: any[] = [];

    Object.keys(this.resultadosTabla).forEach(idEmp => {
      const emp = this.resultadosTabla![idEmp];
      
      this.diasParaTabla.forEach(dia => {
        filasReporte.push({
          'ID Empleado': idEmp,
          'Nombre': emp.nombre,
          'Fecha': dia,
          'Falta (F)': this.obtenerEstadoDirecto(emp, dia, 'F'),
          'Retardo (R)': this.obtenerEstadoDirecto(emp, dia, 'R'),
          'Salida Auditoría (L)': this.obtenerEstadoDirecto(emp, dia, 'L')
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(filasReporte);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Oficinas');
    XLSX.writeFile(wb, `Reporte_Incidencias_Oficinas_${this.fechaInicioStr}.xlsx`);
  }

  // --- COMPORTAMIENTOS CRUD BÁSICOS ---
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

  // --- GESTIÓN DE CALENDARIO CUSTOM ---
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

  // --- GESTIÓN DE TIMEPICKER CUSTOM ---
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