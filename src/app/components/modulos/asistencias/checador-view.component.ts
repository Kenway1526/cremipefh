import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import * as XLSX from 'xlsx';
import moment from 'moment';
import { Subscription } from 'rxjs';
import { ReglasService, ReglaEmpleado } from '../../../services/reglas.service';
import { AsistenciasService } from '../../../services/asistencias.service';
import { NotificacionService, Notificacion } from '../../../services/notificacion.service';
import { PdfCorrespondenciaService, IncidenciaColaborador } from '../../../services/pdf-correspondencia.service';

@Component({
  selector: 'app-checador-view',
  templateUrl: './checador-view.component.html',
  styleUrls: ['./checador-view.component.css']
})
export class ChecadorViewComponent implements OnInit {

  public plantelId: string = '';
  public sedeId: string = '';
  public tituloVista: string = 'Checador';

  public modoEdicion: boolean = false;
  public fileName: string = '';
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
  public resultadosTabla: Record<string, any> | null = null;
  public empleadoSeleccionado: any | null = null;
  public diasParaTabla: string[] = [];

  // Notificaciones reactivas (Toast)
  public notificacionActual: Notificacion | null = null;
  private subNotif?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private reglasService: ReglasService,
    private asistenciasService: AsistenciasService,
    private notificacionService: NotificacionService,
    private pdfCorrespondenciaService: PdfCorrespondenciaService
  ) {}

  ngOnInit(): void {
    // Suscripción al servicio de notificaciones reactivo
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
      
      // Notificación de éxito integrada mediante el Subject reactivo
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
      nombre_completo: '',
      limite_retardo_inicio: '08:00',
      limite_retardo_fin: '08:15',
      activo: true
    });
    this.notificacionService.mostrar('Empleado agregado a la lista', 'exito');
  }

  onFileChange(event: any): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.fileName = file.name;
    this.dataExcelMemoria = [];
    this.resultadosTabla = null;
    this.cdr.detectChanges();

    const reader = new FileReader();

    reader.onload = (e: any) => {
      try {
        const dataBuffer = new Uint8Array(e.target.result);
        const workbook = XLSX.read(dataBuffer, { type: 'array', cellDates: true });

        const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('asistencia'))
                       || (workbook.SheetNames.length > 2 ? workbook.SheetNames[2] : workbook.SheetNames[0]);

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

        const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

        if (this.plantelId === 'toluca' && this.sedeId === 'secundaria') {
          this.dataExcelMemoria = this.asistenciasService.parsearExcelSecundaria(rawData);
        } else {
          this.dataExcelMemoria = this.asistenciasService.parsearExcelMatricial(rawData, this.fechaInicioStr);
        }

        this.cdr.detectChanges();

        if (this.dataExcelMemoria.length > 0) {
          this.notificacionService.mostrar(`Excel procesado: ${this.dataExcelMemoria.length} marcajes listos`, 'exito');
        } else {
          this.notificacionService.mostrar('No se detectaron marcajes válidos para este periodo', 'alerta');
        }
      } catch (err: any) {
        this.notificacionService.mostrar('Error al leer Excel: ' + err.message, 'error');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  generarProcesamiento(): void {
    if (!this.dataExcelMemoria || this.dataExcelMemoria.length === 0) {
      this.notificacionService.mostrar('No hay marcajes cargados en memoria. Selecciona un archivo Excel.', 'alerta');
      return;
    }

    if (!this.reglas || this.reglas.length === 0) {
      this.notificacionService.mostrar('No hay reglas configuradas para este plantel y sede.', 'alerta');
      return;
    }

    try {
      const { resultados, diasLaborales } = this.asistenciasService.procesarAsistencias(
        this.dataExcelMemoria,
        this.reglas,
        this.fechaInicioStr,
        this.fechaFinStr
      );

      this.diasParaTabla = diasLaborales;
      this.resultadosTabla = resultados;
      this.cdr.detectChanges();
      this.notificacionService.mostrar('Análisis finalizado con éxito', 'exito');
    } catch (err: any) {
      this.notificacionService.mostrar('Error en motor de asistencia: ' + err.message, 'error');
    }
  }

  obtenerEstadoDirecto(d: any, dia: string, tipo: 'F' | 'R' | 'L' | 'S'): string {
    const condicion = d.faltasEspeciales ? d.faltasEspeciales[dia] : undefined;

    if (tipo === 'F') {
      if (!d.asistencias[dia]) return 'F';
      if (condicion === 'SALIDA_O_DESPUES' && (!d.salidasDetectadas || !d.salidasDetectadas[dia])) return 'F';
      if (condicion === 'ANTES_DE_HORA') return 'OK';
      return '';
    }

    if (tipo === 'R') return d.retardos[dia] || '';
    if (tipo === 'L') return d.paracaidismo[dia] || (d.limites ? d.limites[dia] : '') || '';

    if (tipo === 'S') {
      if (!d.asistencias[dia]) return '';
      if (condicion === 'ANTES_DE_HORA') return '';
      if (condicion === 'SALIDA_O_DESPUES') return '';
      return 'SS';
    }

    return '';
  }

  abrirModalEmpleado(empleado: any): void {
    this.empleadoSeleccionado = empleado;
  }

  cerrarModalEmpleado(): void {
    this.empleadoSeleccionado = null;
  }

  exportarExcelResultados(): void {
    if (!this.resultadosTabla || Object.keys(this.resultadosTabla).length === 0) {
      this.notificacionService.mostrar('No hay datos procesados para exportar', 'alerta');
      return;
    }

    const diasLaborales = this.diasParaTabla.filter(diaStr => {
      const diaSemana = moment(diaStr).day();
      return diaSemana !== 0 && diaSemana !== 6;
    });

    if (diasLaborales.length === 0) {
      this.notificacionService.mostrar('No hay días hábiles dentro del rango seleccionado', 'alerta');
      return;
    }

    const filasReporte: any[] = [];

    Object.keys(this.resultadosTabla).forEach(idEmp => {
      const emp = this.resultadosTabla![idEmp];

      const fila: Record<string, any> = {
        'ID': idEmp,
        'Nombre': emp.nombre
      };

      diasLaborales.forEach(diaStr => {
        const numeroDia = moment(diaStr).format('DD');
        
        const falta = this.obtenerEstadoDirecto(emp, diaStr, 'F');
        const retardo = this.obtenerEstadoDirecto(emp, diaStr, 'R');
        const salida = this.obtenerEstadoDirecto(emp, diaStr, 'S');

        let valorDia = '';
        if (falta === 'F') {
          valorDia = 'F';
        } else if (retardo) {
          valorDia = retardo;
        } else if (salida === 'SS') {
          valorDia = 'SS';
        } else {
          valorDia = '✓';
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

  async exportarPdfCorrespondencia(): Promise<void> {
    if (!this.resultadosTabla || Object.keys(this.resultadosTabla).length === 0) {
      this.notificacionService.mostrar('No hay datos procesados para exportar', 'alerta');
      return;
    }

    const mesAnioTexto = moment(this.fechaInicioStr).format('MMMM YYYY').toUpperCase();
    const listaCorrespondencia: IncidenciaColaborador[] = [];

    Object.keys(this.resultadosTabla).forEach(idEmp => {
      const emp = this.resultadosTabla![idEmp];
      const incidenciasDetalle: string[] = [];
      let totalRetardos = 0;
      let totalFaltas = 0;

      const reglaEmp = this.reglas.find(r => String(r.id_empleado).trim() === String(idEmp).trim());
      const horaProgramada = reglaEmp?.limite_retardo_inicio || '07:00';

      this.diasParaTabla.forEach(dia => {
        const retardo = this.obtenerEstadoDirecto(emp, dia, 'R');
        const falta = this.obtenerEstadoDirecto(emp, dia, 'F');

        if (retardo) {
          totalRetardos++;
          incidenciasDetalle.push(retardo !== 'R' ? retardo : `${dia} (${retardo})`);
        } else if (falta === 'F') {
          totalFaltas++;
          incidenciasDetalle.push(`${dia} (FALTA)`);
        }
      });

      listaCorrespondencia.push({
        idEmpleado: idEmp,
        nombreCompleto: emp.nombre || 'COLABORADOR',
        horaEntradaProgramada: horaProgramada,
        mesAnio: mesAnioTexto,
        totalRetardos,
        totalFaltas,
        horasIncidencias: incidenciasDetalle
      });
    });

    try {
      await this.pdfCorrespondenciaService.generarReportesCorrespondencia(listaCorrespondencia);
      this.notificacionService.mostrar('Correspondencia PDF generada correctamente.', 'exito');
    } catch (err: any) {
      this.notificacionService.mostrar(err.message || 'Error al generar actas en PDF', 'alerta');
    }
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