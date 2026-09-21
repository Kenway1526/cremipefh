import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import * as XLSX from 'xlsx';
import moment from 'moment';
import { Subscription } from 'rxjs';
import { ReglasService, ReglaEmpleado } from '../../../services/reglas.service';
import { NotificacionService, Notificacion } from '../../../services/notificacion.service';
import { PdfCorrespondenciaService, IncidenciaColaborador } from '../../../services/pdf-correspondencia.service';

export interface DetalleDiaEvaluado {
  estatus_entrada: 'A_TIEMPO' | 'RETARDO' | 'FALTA';
  hora_entrada: string | null;
  hora_salida: string | null;
  marcajes_crudos: string[];
}

export interface DetalleIncidenciaDia {
  dia: string;
  tipo: 'RETARDO' | 'FALTA';
  horaChecada?: string;
  justificado: boolean;
}

export interface EmpleadoIncidenciaCard {
  id_empleado: string;
  nombre: string;
  seleccionadoParaReporte: boolean;
  incidencias: DetalleIncidenciaDia[];
}

export interface EmpleadoEvaluado {
  id_empleado: string;
  nombre: string;
  horario_base: {
    entrada_oficial: string;
    salida_oficial: string;
  };
  dias: Record<string, DetalleDiaEvaluado>;
}

@Component({
  selector: 'app-checador-view',
  templateUrl: './checador-view.component.html',
  styleUrls: ['./checador-view.component.css']
})
export class ChecadorViewComponent implements OnInit, OnDestroy {

  public plantelId: string = '';
  public sedeId: string = '';
  public tituloVista: string = 'Checador';

  public modoEdicion: boolean = false;
  public fileName: string = '';
  public rawDataExcel: any[][] = [];
  public dataExcelMemoria: any[] = [];
  public reglas: ReglaEmpleado[] = [];

  // Fechas y Calendario
  public fechaInicioStr: string = moment().startOf('month').format('YYYY-MM-DD');
  public fechaFinStr: string = moment().format('YYYY-MM-DD');
  public showCalendar: boolean = false;
  public tipoFechaSeleccion: 'inicio' | 'fin' = 'inicio';
  public currentCalendarDate = moment();
  public semanas: string[] = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  public diasCalendario: (number | null)[] = [];

  // Time Picker
  public showTimePicker: boolean = false;
  public timeTarget: { registro: any, campo: 'inicio' | 'fin' } | null = null;
  public horaSeleccionada: string = '08';
  public minutoSeleccionado: string = '00';
  public horasDisponibles: string[] = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  public minutosDisponibles: string[] = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  // Resultados
  public resultadosTabla: Record<string, EmpleadoEvaluado> | null = null;
  public diasParaTabla: string[] = [];
  
  // Cards y Modales
  public empleadosIncidencias: EmpleadoIncidenciaCard[] = [];
  public empleadoSeleccionadoModal: EmpleadoIncidenciaCard | null = null;
  public empleadoSeleccionado: any | null = null;

  // Notificaciones
  public notificacionActual: Notificacion | null = null;
  private subNotif?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private reglasService: ReglasService,
    private notificacionService: NotificacionService,
    private pdfCorrespondenciaService: PdfCorrespondenciaService
  ) {}

  ngOnInit(): void {
    this.subNotif = this.notificacionService.notificacion$.subscribe(n => {
      this.notificacionActual = n;
      this.cdr.detectChanges();
    });

    this.route.params.subscribe(params => {
      this.plantelId = (params['plantelId'] || '').toLowerCase().trim();
      this.sedeId = (params['sedeId'] || '').toLowerCase().trim();
      this.formatearTitulo();
      this.cargarReglas();
    });
  }

  ngOnDestroy(): void {
    if (this.subNotif) {
      this.subNotif.unsubscribe();
    }
  }

  private formatearTitulo(): void {
    const sedeNombre = this.sedeId ? this.sedeId.charAt(0).toUpperCase() + this.sedeId.slice(1) : '';
    const plantelNombre = this.plantelId ? this.plantelId.charAt(0).toUpperCase() + this.plantelId.slice(1) : '';
    this.tituloVista = `Checador ${plantelNombre} - ${sedeNombre}`;
  }

  async cargarReglas(): Promise<void> {
    try {
      const { data, error } = await this.reglasService.getReglasPorSede(this.plantelId, this.sedeId);
      if (error) throw error;
      this.reglas = data || [];
      this.cdr.detectChanges();
    } catch (err: any) {
      this.notificacionService.mostrar('Error al cargar reglas: ' + err.message, 'error');
    }
  }

  async guardarCambiosMasivos(): Promise<void> {
    const reglasValidas = this.reglas.every(r => r.id_empleado && r.nombre_completo);
    if (!reglasValidas) {
      this.notificacionService.mostrar('Asegúrate de que todos los empleados tengan ID y Nombre', 'alerta');
      return;
    }

    try {
      const { error } = await this.reglasService.guardarReglasMasivas(this.plantelId, this.sedeId, this.reglas);
      if (error) throw error;
      this.notificacionService.mostrar('Configuración de personal actualizada correctamente.', 'exito');
      this.cargarReglas();
      this.modoEdicion = false;
    } catch (err: any) {
      this.notificacionService.mostrar('Error al guardar: ' + err.message, 'error');
    }
  }

  agregarRegla(): void {
    this.reglas.unshift({
      id_empleado: '',
      numero_empleado: '',
      nombre_completo: '',
      limite_retardo_inicio: '08:00',
      limite_retardo_fin: '16:00',
      activo: true
    });
    this.notificacionService.mostrar('Empleado agregado a la lista', 'exito');
  }

  // ==========================================
  // PARSERS Y MOTOR DE EVALUACIÓN
  // ==========================================

  private limpiarId(idRaw: any): string {
    if (!idRaw) return '';
    const str = String(idRaw).trim();
    const num = parseInt(str, 10);
    return isNaN(num) ? str : String(num);
  }

  private parsearExcelMatricial(rawData: any[], fechaInicioStr: string): any[] {
    const marcajes: any[] = [];
    let empleadoActual: any = null;
    let filaIdIdx = -1;

    const filaDias = rawData[3] || [];
    const mapaColumnasFechas: Record<number, string> = {};

    const baseDate = moment(fechaInicioStr, 'YYYY-MM-DD');
    let anioCursor = baseDate.year();
    let mesCursor = baseDate.month();
    let diaAnterior: number | null = null;

    filaDias.forEach((celda: any, idx: number) => {
      const txt = celda?.toString().trim();
      const numDia = parseInt(txt, 10);

      if (!isNaN(numDia) && numDia >= 1 && numDia <= 31) {
        if (diaAnterior !== null && numDia < diaAnterior) {
          mesCursor++;
          if (mesCursor > 11) {
            mesCursor = 0;
            anioCursor++;
          }
        }
        const fechaNormalizada = baseDate.clone().year(anioCursor).month(mesCursor).date(numDia).format('YYYY-MM-DD');
        mapaColumnasFechas[idx] = fechaNormalizada;
        diaAnterior = numDia;
      }
    });

    for (let i = 0; i < rawData.length; i++) {
      const fila = rawData[i];
      const tieneId = fila.some((c: any) => c && c.toString().trim().toUpperCase() === "ID:");

      if (tieneId || fila[0]?.toString().trim().toUpperCase() === "ID:") {
        const idxId = fila.findIndex((c: any) => c && c.toString().trim().toUpperCase() === "ID:");
        const rawId = fila[idxId + 1] || fila[4] || '';
        const idNormalizado = this.limpiarId(rawId);
        const nombreExtraido = fila[10]?.toString().trim() || fila[9]?.toString().trim() || 'SIN NOMBRE';

        if (idNormalizado) {
          empleadoActual = { id: idNormalizado, nombre: nombreExtraido };
          filaIdIdx = i;
        }
        continue;
      }

      if (empleadoActual && i === filaIdIdx + 1) {
        fila.forEach((celda: any, colIdx: number) => {
          const valor = celda?.toString().trim();
          if (valor && valor.includes(':')) {
            const fechaStr = mapaColumnasFechas[colIdx];
            if (fechaStr) {
              const marcajesExtraidos = valor
                .split(/[\n\r\s]+/)
                .map((h: string) => h.trim())
                .filter((h: string) => h.includes(':'));

              marcajesExtraidos.forEach((horaLimpia: string) => {
                marcajes.push({
                  id_empleado: empleadoActual.id,
                  nombre: empleadoActual.nombre,
                  fecha: fechaStr,
                  hora: horaLimpia.substring(0, 5)
                });
              });
            }
          }
        });
        empleadoActual = null;
      }
    }

    return marcajes;
  }

  private parsearExcelSecundaria(rawData: any[]): any[] {
    if (!rawData || rawData.length === 0) return [];

    const idIdx = 2; 
    const dIdx = 3;  
    const marcajes: any[] = [];
    const filasDatos = rawData.slice(1);

    filasDatos.forEach((row: any) => {
      const valId = row[idIdx];
      const valFecha = row[dIdx];

      if (!valId || !valFecha) return;

      let mFecha;
      if (valFecha instanceof Date) {
        mFecha = moment(valFecha);
      } else if (typeof valFecha === 'number') {
        try {
          const objDate = XLSX.SSF.parse_date_code(valFecha);
          mFecha = moment({
            year: objDate.y,
            month: objDate.m - 1,
            date: objDate.d,
            hours: objDate.H || 0,
            minutes: objDate.M || 0,
            seconds: objDate.S || 0
          });
        } catch (err) {
          mFecha = moment(valFecha);
        }
      } else {
        const fechaStr = valFecha.toString().trim()
          .replace(/p\.\s*m\./gi, 'PM')
          .replace(/a\.\s*m\./gi, 'AM');

        const formatos = [
          'DD/MM/YYYY hh:mm:ss A', 'DD/MM/YYYY h:mm:ss A',
          'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DD HH:mm:ss', 'DD-MM-YYYY HH:mm:ss'
        ];

        mFecha = moment(fechaStr, formatos, true);
        if (!mFecha.isValid()) mFecha = moment(fechaStr, 'DD/MM/YYYY h:mm A', true);
        if (!mFecha.isValid()) mFecha = moment(fechaStr);
      }

      if (mFecha && mFecha.isValid()) {
        marcajes.push({
          id_empleado: this.limpiarId(valId),
          fecha: mFecha.format('YYYY-MM-DD'),
          hora: mFecha.format('HH:mm')
        });
      }
    });

    return marcajes;
  }

  private procesarMotor(dataMemoria: any[], reglas: ReglaEmpleado[], fechaInicioStr: string, fechaFinStr: string, isSecundaria: boolean) {
    const mInicio = moment(fechaInicioStr, 'YYYY-MM-DD').startOf('day');
    const mFin = moment(fechaFinStr, 'YYYY-MM-DD').endOf('day');
    const diasLaborales: string[] = [];

    const aux = mInicio.clone();
    while (aux.isSameOrBefore(mFin)) {
      if (aux.day() !== 0 && aux.day() !== 6) {
        diasLaborales.push(aux.format('YYYY-MM-DD'));
      }
      aux.add(1, 'days');
    }

    const toMins = (hStr: string) => {
      if (!hStr || !hStr.includes(':')) return 0;
      const [h, m] = hStr.split(':').map(Number);
      return (h * 60) + m;
    };

    const agrupadoPorColaboradorYDia: Record<string, Record<string, string[]>> = {};
    const resultadoEmpleados: Record<string, EmpleadoEvaluado> = {};

    reglas.filter(r => r.activo).forEach(r => {
      const idKey = this.limpiarId(r.id_empleado);
      resultadoEmpleados[idKey] = {
        id_empleado: idKey,
        nombre: r.nombre_completo,
        horario_base: {
          entrada_oficial: r.limite_retardo_inicio ? r.limite_retardo_inicio.substring(0, 5) : (isSecundaria ? '07:00' : '08:00'),
          salida_oficial: r.limite_retardo_fin ? r.limite_retardo_fin.substring(0, 5) : (isSecundaria ? '15:00' : '16:00')
        },
        dias: {}
      };

      agrupadoPorColaboradorYDia[idKey] = {};
      diasLaborales.forEach(dia => {
        agrupadoPorColaboradorYDia[idKey][dia] = [];
      });
    });

    dataMemoria.forEach(reg => {
      const fechaOrigen = reg.fecha || reg.fechaStr;
      if (!fechaOrigen) return;

      const mFechaReg = moment(fechaOrigen, 'YYYY-MM-DD');
      if (mFechaReg.isValid() && mFechaReg.isSameOrAfter(mInicio) && mFechaReg.isSameOrBefore(mFin)) {
        const fKey = mFechaReg.format('YYYY-MM-DD');
        const idEmp = this.limpiarId(reg.id_empleado);

        if (agrupadoPorColaboradorYDia[idEmp] && agrupadoPorColaboradorYDia[idEmp][fKey]) {
          const horaLimpia = (reg.hora || '').substring(0, 5);
          if (horaLimpia && !agrupadoPorColaboradorYDia[idEmp][fKey].includes(horaLimpia)) {
            agrupadoPorColaboradorYDia[idEmp][fKey].push(horaLimpia);
          }
        }
      }
    });

    Object.keys(resultadoEmpleados).forEach(idEmp => {
      const emp = resultadoEmpleados[idEmp];
      const minEntradaOficial = toMins(emp.horario_base.entrada_oficial);

      diasLaborales.forEach(dia => {
        const checadas = (agrupadoPorColaboradorYDia[idEmp][dia] || []).sort((a, b) => toMins(a) - toMins(b));

        if (checadas.length === 0) {
          emp.dias[dia] = {
            estatus_entrada: 'FALTA',
            hora_entrada: null,
            hora_salida: null,
            marcajes_crudos: []
          };
          return;
        }

        const primeraChecada = checadas[0];
        const minPrimeraChecada = toMins(primeraChecada);
        const estatusEntrada = minPrimeraChecada <= minEntradaOficial ? 'A_TIEMPO' : 'RETARDO';

        let horaSalida: string | null = null;
        if (checadas.length > 1) {
          const ultimaChecada = checadas[checadas.length - 1];
          const minUltimaChecada = toMins(ultimaChecada);
          if (minUltimaChecada - minPrimeraChecada >= 30) {
            horaSalida = ultimaChecada;
          }
        }

        emp.dias[dia] = {
          estatus_entrada: estatusEntrada,
          hora_entrada: primeraChecada,
          hora_salida: horaSalida,
          marcajes_crudos: checadas
        };
      });
    });

    return { diasLaborales, resultados: resultadoEmpleados };
  }

  // ==========================================
  // EVENTOS DEL COMPONENTE
  // ==========================================

  onFileChange(event: any): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.fileName = file.name;
    this.rawDataExcel = [];
    this.dataExcelMemoria = [];
    this.resultadosTabla = null;
    this.empleadosIncidencias = [];
    this.cdr.detectChanges();

    const reader = new FileReader();

    reader.onload = (e: any) => {
      try {
        const dataBuffer = new Uint8Array(e.target.result);
        const workbook = XLSX.read(dataBuffer, { type: 'array', cellDates: true });

        const isSecundaria = this.plantelId === 'toluca' && this.sedeId === 'secundaria';
        let sheetName = '';

        if (isSecundaria) {
          sheetName = workbook.SheetNames.includes('Hoja1') ? 'Hoja1' : workbook.SheetNames[0];
        } else {
          sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('asistencia'))
                       || (workbook.SheetNames.length > 2 ? workbook.SheetNames[2] : workbook.SheetNames[0]);
        }

        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          this.notificacionService.mostrar('No se encontró la hoja de asistencias en el libro', 'error');
          return;
        }

        let maxRow = 0, maxCol = 0;
        Object.keys(sheet).forEach(key => {
          if (key.startsWith('!')) return;
          const addr = XLSX.utils.decode_cell(key);
          if (addr.r > maxRow) maxRow = addr.r;
          if (addr.c > maxCol) maxCol = addr.c;
        });
        sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });

        this.rawDataExcel = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
        this.notificacionService.mostrar(`Archivo cargado (${this.rawDataExcel.length} filas). Listo para procesar.`, 'exito');
        this.cdr.detectChanges();
      } catch (err: any) {
        this.notificacionService.mostrar('Error al leer Excel: ' + err.message, 'error');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  generarProcesamiento(): void {
    if (!this.rawDataExcel || this.rawDataExcel.length === 0) {
      this.notificacionService.mostrar('No hay datos en memoria. Selecciona un archivo Excel.', 'alerta');
      return;
    }

    if (!this.reglas || this.reglas.length === 0) {
      this.notificacionService.mostrar('No hay reglas configuradas para este plantel y sede.', 'alerta');
      return;
    }

    try {
      const isSecundaria = this.plantelId === 'toluca' && this.sedeId === 'secundaria';

      if (isSecundaria) {
        this.dataExcelMemoria = this.parsearExcelSecundaria(this.rawDataExcel);
      } else {
        this.dataExcelMemoria = this.parsearExcelMatricial(this.rawDataExcel, this.fechaInicioStr);
      }

      const { resultados, diasLaborales } = this.procesarMotor(
        this.dataExcelMemoria,
        this.reglas,
        this.fechaInicioStr,
        this.fechaFinStr,
        isSecundaria
      );

      this.diasParaTabla = diasLaborales;
      this.resultadosTabla = resultados;

      // Filtrado exclusivo de tarjetas con incidencias
      this.empleadosIncidencias = [];

      Object.keys(resultados).forEach(idEmp => {
        const emp = resultados[idEmp];
        const incidenciasEmpleado: DetalleIncidenciaDia[] = [];

        diasLaborales.forEach(diaStr => {
          const diaEval = emp.dias[diaStr];
          if (!diaEval) return;

          if (diaEval.estatus_entrada === 'FALTA') {
            incidenciasEmpleado.push({
              dia: diaStr,
              tipo: 'FALTA',
              justificado: false
            });
          } else if (diaEval.estatus_entrada === 'RETARDO') {
            incidenciasEmpleado.push({
              dia: diaStr,
              tipo: 'RETARDO',
              horaChecada: diaEval.hora_entrada || '',
              justificado: false
            });
          }
        });

        if (incidenciasEmpleado.length > 0) {
          this.empleadosIncidencias.push({
            id_empleado: idEmp,
            nombre: emp.nombre || 'SIN NOMBRE',
            seleccionadoParaReporte: true,
            incidencias: incidenciasEmpleado
          });
        }
      });

      this.cdr.detectChanges();
      this.notificacionService.mostrar(`Análisis finalizado. Se detectaron ${this.empleadosIncidencias.length} colaboradores con incidencias.`, 'exito');
    } catch (err: any) {
      this.notificacionService.mostrar('Error en motor de asistencia: ' + err.message, 'error');
    }
  }

  obtenerEstadoDirecto(emp: EmpleadoEvaluado | any, dia: string, tipo: 'F' | 'R' | 'L' | 'S'): string {
    if (!emp || !emp.dias || !emp.dias[dia]) return '';
    const d: DetalleDiaEvaluado = emp.dias[dia];

    if (tipo === 'F') return d.estatus_entrada === 'FALTA' ? 'F' : '';
    if (tipo === 'R') return d.estatus_entrada === 'RETARDO' ? (d.hora_entrada || 'R') : '';
    if (tipo === 'S') return d.hora_salida || '';
    return '';
  }

  abrirModalEmpleado(empleado: EmpleadoIncidenciaCard | any): void {
    if (empleado.incidencias) {
      this.empleadoSeleccionadoModal = empleado;
    } else {
      this.empleadoSeleccionado = empleado;
    }
  }

  cerrarModalEmpleado(): void {
    this.empleadoSeleccionadoModal = null;
    this.empleadoSeleccionado = null;
  }

  async exportarPdfCorrespondencia(): Promise<void> {
    const RAZONES_SOCIALES: Record<string, string> = {
      toluca: 'INSTITUTO PROFESIONAL EN LA ENSEÑANZA Y FORMACIÓN HUMANA S.C.',
      calimaya: 'CENTRO EDUCATIVO CALIMAYA S.C.',
      aeropuerto: 'DESARROLLO EDUCATIVO AEROPUERTO S.C.'
    };

    const MESES_ES: string[] = [
      'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
      'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
    ];

    if (!this.empleadosIncidencias || this.empleadosIncidencias.length === 0) {
      this.notificacionService.mostrar('No hay incidencias procesadas para exportar', 'alerta');
      return;
    }

    const empleadosAProcesar = this.empleadosIncidencias.filter(emp => emp.seleccionadoParaReporte);

    if (empleadosAProcesar.length === 0) {
      this.notificacionService.mostrar('No hay empleados seleccionados en las tarjetas', 'alerta');
      return;
    }

    // Cálculo del periodo en español (soporta 1 o 2 meses)
    const mInicio = moment(this.fechaInicioStr, 'YYYY-MM-DD');
    const mFin = moment(this.fechaFinStr, 'YYYY-MM-DD');
    const mesInicio = MESES_ES[mInicio.month()];
    const mesFin = MESES_ES[mFin.month()];
    const anioFin = mFin.year();

    const mesAnioTexto = (mInicio.month() === mFin.month())
      ? `${mesInicio} ${anioFin}`
      : `${mesInicio} - ${mesFin} ${anioFin}`;

    const razonSocialActual = RAZONES_SOCIALES[this.plantelId] || 'INSTITUTO PROFESIONAL EN LA ENSEÑANZA Y FORMACION HUMANA S.C.';

    const listaCorrespondencia: IncidenciaColaborador[] = [];

    empleadosAProcesar.forEach(emp => {
      const reglaEmp = this.reglas.find(r => String(r.id_empleado).trim() === String(emp.id_empleado).trim());
      
      // Si no tiene número de empleado registrado, se deja completamente en blanco
      const numeroEmpleadoFinal = reglaEmp?.numero_empleado ? String(reglaEmp.numero_empleado).trim() : '';
      const horaOficial = reglaEmp?.limite_retardo_inicio ? reglaEmp.limite_retardo_inicio.substring(0, 5) : '08:00';

      const incidenciasValidas: string[] = [];
      emp.incidencias.forEach(inc => {
        if (!inc.justificado) {
          const fechaFormateada = moment(inc.dia).format('DD/MM/YYYY');
          if (inc.tipo === 'RETARDO') {
            incidenciasValidas.push(`${fechaFormateada} - ${inc.horaChecada || 'RETARDO'}`);
          } else {
            incidenciasValidas.push(`${fechaFormateada} - FALTA`);
          }
        }
      });

      if (incidenciasValidas.length > 0) {
        listaCorrespondencia.push({
          numeroEmpleado: numeroEmpleadoFinal,
          nombreCompleto: emp.nombre,
          horaEntradaProgramada: horaOficial,
          mesAnio: mesAnioTexto,
          razonSocial: razonSocialActual,
          horasIncidencias: incidenciasValidas
        });
      }
    });

    if (listaCorrespondencia.length === 0) {
      this.notificacionService.mostrar('Todas las incidencias seleccionadas quedaron justificadas', 'alerta');
      return;
    }

    try {
      await this.pdfCorrespondenciaService.generarReportesCorrespondencia(listaCorrespondencia);
      this.notificacionService.mostrar('PDF de actas generado exitosamente.', 'exito');
    } catch (err: any) {
      this.notificacionService.mostrar('Error al generar PDF: ' + err.message, 'error');
    }
  }

  exportarExcelResultados(): void {
    if (!this.resultadosTabla || Object.keys(this.resultadosTabla).length === 0) {
      this.notificacionService.mostrar('No hay datos procesados para exportar', 'alerta');
      return;
    }

    const filasReporte: any[] = [];
    Object.keys(this.resultadosTabla).forEach(idEmp => {
      const emp = this.resultadosTabla![idEmp];
      const fila: Record<string, any> = { 'ID': idEmp, 'Nombre': emp.nombre };

      this.diasParaTabla.forEach(diaStr => {
        const numeroDia = moment(diaStr).format('DD');
        const diaEval = emp.dias[diaStr];

        let valorDia = '✓';
        if (diaEval) {
          if (diaEval.estatus_entrada === 'FALTA') {
            valorDia = 'F';
          } else if (diaEval.estatus_entrada === 'RETARDO') {
            valorDia = diaEval.hora_entrada || 'R';
          }
        }
        
        fila[numeroDia] = valorDia;
      });

      filasReporte.push(fila);
    });

    const ws = XLSX.utils.json_to_sheet(filasReporte);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencias');
    const nombreArchivo = `Reporte_${this.plantelId}_${this.sedeId}_${moment(this.fechaInicioStr).format('YYYY-MM-DD')}_al_${moment(this.fechaFinStr).format('YYYY-MM-DD')}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
    this.notificacionService.mostrar('Reporte en Excel generado con éxito', 'exito');
  }

  regresarAlHub(): void {
    this.router.navigate(['/hub']);
  }

  // --- CALENDARIO CUSTOM ---
  abrirCalendario(target: 'inicio' | 'fin'): void {
    this.tipoFechaSeleccion = target;
    const fecha = target === 'inicio' ? this.fechaInicioStr : this.fechaFinStr;
    this.currentCalendarDate = moment(fecha);
    this.generarDias();
    this.showCalendar = true;
  }

  generarDias(): void {
    const startOfMonth = this.currentCalendarDate.clone().startOf('month');
    const endOfMonth = this.currentCalendarDate.clone().endOf('month');
    const startDay = startOfMonth.day();
    this.diasCalendario = [];

    for (let i = 0; i < startDay; i++) this.diasCalendario.push(null);
    for (let date = 1; date <= endOfMonth.date(); date++) this.diasCalendario.push(date);
  }

  cambiarMes(delta: number): void {
    this.currentCalendarDate.add(delta, 'months');
    this.generarDias();
  }

  seleccionarFecha(dia: number | null): void {
    if (!dia) return;
    const fechaSel = this.currentCalendarDate.clone().date(dia).format('YYYY-MM-DD');
    if (this.tipoFechaSeleccion === 'inicio') this.fechaInicioStr = fechaSel;
    else this.fechaFinStr = fechaSel;
    this.showCalendar = false;
    this.cdr.detectChanges();
  }

  trackByFn(index: number): number {
    return index;
  }

  // --- TIME PICKER ---
  abrirTimePicker(regla: any, campo: 'inicio' | 'fin'): void {
    this.timeTarget = { registro: regla, campo };
    const valorActual = campo === 'inicio' ? regla.limite_retardo_inicio : regla.limite_retardo_fin;
    if (valorActual) {
      const [h, m] = valorActual.split(':');
      this.horaSeleccionada = h;
      this.minutoSeleccionado = m.substring(0, 2);
    }
    this.showTimePicker = true;
  }

  confirmarHora(): void {
    if (this.timeTarget) {
      const nuevaHora = `${this.horaSeleccionada}:${this.minutoSeleccionado}`;
      if (this.timeTarget.campo === 'inicio') {
        this.timeTarget.registro.limite_retardo_inicio = nuevaHora;
      } else {
        this.timeTarget.registro.limite_retardo_fin = nuevaHora;
      }
    }
    this.showTimePicker = false;
    this.cdr.detectChanges();
  }
}