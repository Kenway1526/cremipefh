import { Component, OnInit } from '@angular/core';
import * as XLSX from 'xlsx';
import moment from 'moment';
import { ReglasService } from '../../../services/reglas.service';
import { NotificacionService } from '../../../services/notificacion.service';

interface ResultadoEmpleado {
  nombre: string;
  asistencias: { [key: string]: string };
  retardos: { [key: string]: string };
  paracaidismo: { [key: string]: string }; // 🔥 Reemplaza 'limites' para Franja 3 (Paracaidismo)
  faltasEspeciales: { [key: string]: 'ANTES_DE_HORA' | 'RETARDO' | 'PARACAIDISTA' | 'SALIDA_O_DESPUES' }; // 🔥 Tipos actualizados
  reglaInicio: string; // Representa tu variable 'entrada' de la BD
  reglaFin: string;    // Representa tu variable 'salida' de la BD
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
  asignarDatosNetlify(resultadosJson: any[]) {
    this.dataExcelMemoria = resultadosJson;
    this.notificaciones.mostrar(`Servidor: ${this.dataExcelMemoria.length} marcajes cargados`, 'exito');
  }

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
        
        const filaDiasEncabezado = rawData[3]; // Fila 4 con los días reales
        const resultados: any[] = [];
        
        // 💡 Definimos explícitamente la estructura que puede tomar el empleado actual
        let empleadoActual: { id_excel: string; nombre_excel: string; filaIdx: number } | null = null;

        for (let i = 0; i < rawData.length; i++) {
          const fila = rawData[i];
          
          const tieneIdToken = fila.some((celda: any) => celda && celda.toString().trim().toUpperCase() === "ID:");

          if (tieneIdToken) {
            const idExtraido = fila[4]?.toString().trim();
            const nombreExtraido = fila[10]?.toString().trim();

            if (idExtraido) {
              empleadoActual = {
                id_excel: idExtraido, 
                nombre_excel: nombreExtraido || 'SIN NOMBRE', 
                filaIdx: i
              };
            }
            continue;
          }

          if (empleadoActual && i === empleadoActual.filaIdx + 1) {
            for (let col = 0; col <= 30; col++) {
              const celdaRaw = fila[col]?.toString().trim();
              
              if (celdaRaw && celdaRaw.includes(':')) {
                const diaReal = filaDiasEncabezado[col]?.toString().trim();

                if (diaReal) {
                  // 💡 Seteamos tipo string explícito a los parámetros 'h' de los métodos funcionales
                  const marcajesExtraidos = celdaRaw
                    .split(/[\n\r\s]+/)
                    .map((h: string) => h.trim())
                    .filter((h: string) => h.includes(':'));

                  // 💡 Seteamos tipo string explícito a 'horaLimpia'
                  marcajesExtraidos.forEach((horaLimpia: string) => {
                    resultados.push({
                      id_empleado: empleadoActual!.id_excel, // Usamos ! porque ya validamos que existe arriba
                      nombre: empleadoActual!.nombre_excel,
                      dia: Number(diaReal), 
                      entrada: horaLimpia.substring(0, 5)
                    });
                  });
                }
              }
            }
            empleadoActual = null;
          }
        }
        this.dataExcelMemoria = resultados;
        this.notificaciones.mostrar(`Excel Procesado: ${this.dataExcelMemoria.length} marcas en memoria.`, 'exito');
      } catch (err) {
        this.notificaciones.mostrar('Error al leer Excel', 'error');
      }
    };
    reader.readAsBinaryString(file);
  }

  generarProcesamiento() {
    if (!this.dataExcelMemoria || this.dataExcelMemoria.length === 0) {
      this.notificaciones.mostrar('No hay marcajes cargados en memoria', 'alerta');
      return;
    }

    const mInicio = moment(this.fechaInicioStr).startOf('day');
    const mFin = moment(this.fechaFinStr).endOf('day');
    this.diasParaTabla = [];
    
    // 1. Rango de días laborales
    let aux = mInicio.clone();
    while (aux.isSameOrBefore(mFin)) {
      if (aux.day() !== 0 && aux.day() !== 6) {
        this.diasParaTabla.push(aux.format('YYYY-MM-DD'));
      }
      aux.add(1, 'days');
    }

    const mapaCompleto: { [key: string]: ResultadoEmpleado } = {};

    // 2. Inicializar empleados activos
    this.reglas.filter(r => r.activo).forEach(r => {
      const idKey = String(r.id_empleado).trim();
      mapaCompleto[idKey] = {
        nombre: r.nombre_completo,
        asistencias: {}, 
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

    const mesInicioRango = mInicio.month(); 
    const mesFinRango = mFin.month();       
    const diaCorteInicio = mInicio.date();  

    // 3. PROCESO DE CRUCE DE DATOS ABIERTO (ENTRADAS Y SALIDAS)
    this.dataExcelMemoria.forEach(reg => {
      const idExcel = String(reg.id_empleado).trim();
      const emp = mapaCompleto[idExcel];

      if (emp) {
        const diaDelExcel = Number(reg.dia);
        const hMarcaje = reg.entrada; 

        let mesCalculado = (diaDelExcel >= diaCorteInicio) ? mesInicioRango : mesFinRango;

        const fechaConstruidaStr = moment(this.fechaInicioStr)
          .month(mesCalculado)
          .date(diaDelExcel)
          .format('YYYY-MM-DD');

        if (this.diasParaTabla.includes(fechaConstruidaStr)) {
          
          const minMarcaje = toMins(hMarcaje);
          const minEntradaBase = toMins(emp.reglaInicio);
          const minToleranciaFin = minEntradaBase + 30; 
          const minSalidaJornada = toMins(emp.reglaFin); // 💡 Uso de la regla de salida Supabase

          // 🔄 CASO A: Es el primer marcaje del día (Procesamos la Entrada)
          if (!emp.asistencias[fechaConstruidaStr]) {
            emp.asistencias[fechaConstruidaStr] = hMarcaje;

            if (minMarcaje < minEntradaBase) {
              emp.faltasEspeciales[fechaConstruidaStr] = 'ANTES_DE_HORA';
            }
            else if (minMarcaje >= minEntradaBase && minMarcaje <= minToleranciaFin) {
              emp.faltasEspeciales[fechaConstruidaStr] = 'RETARDO';
              emp.retardos[fechaConstruidaStr] = hMarcaje; 
            }
            else if (minMarcaje > minToleranciaFin && minMarcaje <= minSalidaJornada) {
              emp.faltasEspeciales[fechaConstruidaStr] = 'PARACAIDISTA';
              emp.paracaidismo[fechaConstruidaStr] = hMarcaje; 
            }
            else if (minMarcaje > minSalidaJornada) {
              emp.faltasEspeciales[fechaConstruidaStr] = 'SALIDA_O_DESPUES';
            }
          } 
          // 🔄 CASO B: Es un segundo marcaje en el mismo día (Evaluamos si es la Salida legítima)
          else {
            if (minMarcaje >= minSalidaJornada) {
              // Si la checada inicial fue catalogada como FALTA (porque checó tarde), pero ahora vemos que sí marcó salida,
              // o si llegó a tiempo, seteamos un estado base aceptado por tu TypeScript
              emp.faltasEspeciales[fechaConstruidaStr] = 'ANTES_DE_HORA'; 
              
              // Guardamos la checada en un campo que no interfiera para asegurar el registro en auditorías si es necesario
              emp.asistencias[fechaConstruidaStr] = hMarcaje; // Actualiza con el último marcaje (el más reciente de salida)
            }
          }

        }
      }
    });

    // 4. Filtro de visualización analítica
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
        // El estatus 'CERRADO_CON_SALIDA' y 'ANTES_DE_HORA' (si tiene salida en otro lado) no deberían causar ruido si todo está bien,
        // pero si el empleado tiene retardos o paracaidismo, se muestra la fila por la incidencia matutina.
        if (condicion === 'RETARDO' || condicion === 'PARACAIDISTA' || condicion === 'SALIDA_O_DESPUES') {
          tieneIncidencia = true;
          break;
        }
        
        // Si el empleado llegó a tiempo pero dejó la salida abierta (sigue en ANTES_DE_HORA en lugar de CERRADO_CON_SALIDA)
        if (condicion === 'ANTES_DE_HORA') {
          tieneIncidencia = true; // Forzamos mostrar para ver el SS rojo
          break;
        }
      }

      if (tieneIncidencia) {
        mapaFiltrado[idEmpleado] = emp;
      }
    });

    this.resultadosTabla = mapaFiltrado;
    this.notificaciones.mostrar('Análisis finalizado con éxito', 'exito');
  }

  obtenerEstado(id: any, dia: string, tipo: 'F' | 'R' | 'L'): string {
    const idStr = String(id).trim();
    if (!this.resultadosTabla || !this.resultadosTabla[idStr]) return '';
    return this.obtenerEstadoDirecto(this.resultadosTabla[idStr], dia, tipo);
  }

  // Extractor unificado ajustado al render de las 4 franjas (HTML, Tarjetas y Modales)
  obtenerEstadoDirecto(d: ResultadoEmpleado, dia: string, tipo: 'F' | 'R' | 'L' | 'S'): string {
    const condicion = d.faltasEspeciales[dia];

    // --- COLUMNA 1: ASISTENCIA (F) ---
    if (tipo === 'F') {
      if (!d.asistencias[dia]) return 'F'; // Si no checó nada en el día: Falta (F)
      if (condicion === 'SALIDA_O_DESPUES') return 'F'; // Si solo checó salida, no cuenta entrada: Falta (F)
      if (condicion === 'ANTES_DE_HORA') return 'OK'; // Llegó a tiempo: OK
      return ''; // Para retardos o paracaidistas se queda en blanco la columna F
    }

    // --- COLUMNA 2: RETARDO (R) ---
    if (tipo === 'R') {
      return d.retardos[dia] || ''; // Hora exacta si está en rango, sino en blanco
    }

    // --- COLUMNA 3: PARACAIDISMO (L) ---
    if (tipo === 'L') {
      return d.paracaidismo[dia] || ''; // Hora exacta si es paracaidista, sino en blanco
    }

    // --- COLUMNA 4: SALIDA (S) ---
    // --- COLUMNA 4: SALIDA (S) ---
    if (tipo === 'S') {
      if (!d.asistencias[dia]) return ''; 
      
      // Si el estado final se quedó en ANTES_DE_HORA tras registrarse la salida legítima, la celda de SS se limpia automáticamente
      if (condicion === 'ANTES_DE_HORA') return '';
      if (condicion === 'SALIDA_O_DESPUES') return ''; 
      
      // Si se quedó con Retardo o Paracaidista y nunca entró al CASO B para actualizar el objeto, lanza SS
      return 'SS'; 
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
          'Paracaidismo (L)': this.obtenerEstadoDirecto(emp, dia, 'L') // 🔥 Nombre adaptado en el reporte excel
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

  trackByFn(index: number): number {
    return index;
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