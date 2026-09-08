import { Injectable } from '@angular/core';
import moment from 'moment';

@Injectable({
  providedIn: 'root'
})
export class AsistenciasService {

  constructor() {}

  /**
   * Limpia y normaliza IDs (remueve espacios y ceros a la izquierda innecesarios)
   */
  public limpiarId(idRaw: any): string {
    if (!idRaw) return '';
    const str = String(idRaw).trim();
    const num = parseInt(str, 10);
    return isNaN(num) ? str : String(num);
  }

  /**
   * Limpia y normaliza texto para homologar nombres contra Supabase
   */
  public limpiarTexto(str: string): string {
    if (!str) return '';
    return String(str)
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, ' ');
  }

  /**
   * Convierte cadena de hora 'HH:mm' a minutos totales del día
   */
  private toMins(hStr: string): number {
    if (!hStr || !hStr.includes(':')) return 0;
    const [h, m] = hStr.split(':').map(Number);
    return (h * 60) + m;
  }

  /**
   * =========================================================================
   * PARSER 1: SECUNDARIA (Formato Vertical de Registros - ZKTeco / BioStar)
   * =========================================================================
   */
  public parsearExcelSecundaria(rawData: any[]): Array<any> {
    if (!rawData || rawData.length === 0) return [];

    let headerRowIdx = -1;
    let nIdx = -1;
    let dIdx = -1;

    for (let i = 0; i < Math.min(rawData.length, 15); i++) {
      const row = rawData[i] || [];
      const nameCol = row.findIndex((c: any) => {
        const v = c ? c.toString().trim().toLowerCase() : '';
        return v === 'name' || v === 'nombre' || v === 'empleado' || v === 'enrol no' || v === 'id';
      });
      const dateCol = row.findIndex((c: any) => {
        const v = c ? c.toString().trim().toLowerCase() : '';
        return v.includes('date') || v.includes('time') || v.includes('fecha') || v.includes('hora');
      });

      if (nameCol !== -1 && dateCol !== -1) {
        headerRowIdx = i;
        nIdx = nameCol;
        dIdx = dateCol;
        break;
      }
    }

    if (headerRowIdx === -1) {
      headerRowIdx = 0;
      nIdx = 1;
      dIdx = 3;
    }

    const marcajes: Array<any> = [];
    const filasDatos = rawData.slice(headerRowIdx + 1);

    filasDatos.forEach((row: any) => {
      const valNombre = row[nIdx];
      const valFecha = row[dIdx];

      if (!valNombre || !valFecha) return;

      let mFecha: any;
      if (valFecha instanceof Date) {
        mFecha = moment(valFecha);
      } else {
        // Limpiar formato con "p. m." / "a. m." en español
        const fechaStr = valFecha.toString().trim()
          .replace(/p\.\s*m\./gi, 'PM')
          .replace(/a\.\s*m\./gi, 'AM');

        const formatos = [
          'DD/MM/YYYY hh:mm:ss A', 'DD/MM/YYYY h:mm:ss A',
          'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DD HH:mm:ss', 'DD-MM-YYYY HH:mm:ss'
        ];

        mFecha = moment(fechaStr, formatos, true);
        if (!mFecha.isValid()) mFecha = moment(fechaStr);
      }

      if (mFecha && mFecha.isValid()) {
        marcajes.push({
          empleado: String(valNombre).trim(),
          id_empleado: this.limpiarId(valNombre),
          fecha: mFecha.format('YYYY-MM-DD'),
          hora: mFecha.format('HH:mm')
        });
      }
    });

    return marcajes;
  }

  /**
   * =========================================================================
   * PARSER 2: OFICINAS / AEROPUERTO / CALIMAYA (Formato Matricial / Tabular)
   * =========================================================================
   */
  public parsearExcelMatricial(rawData: any[], fechaInicioStr: string): Array<any> {
    const marcajes: Array<any> = [];
    let empleadoActual: { id: string; nombre: string } | null = null;
    let filaIdIdx = -1;

    const filaDias = rawData[3] || [];
    const mapaColumnasFechas: { [col: number]: string } = {};

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
        const fechaNormalizada = moment().year(anioCursor).month(mesCursor).date(numDia).format('YYYY-MM-DD');
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
                  id_empleado: empleadoActual?.id,
                  empleado: empleadoActual?.nombre,
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

  /**
   * =========================================================================
   * MOTOR DE PROCESAMIENTO ÚNICO (Reglas Supabase e Incidencias)
   * =========================================================================
   */
  public procesarAsistencias(
    dataMarcajes: Array<{ id_empleado?: string; empleado?: string; fecha: string; hora: string }>,
    reglas: Array<any>,
    fechaInicioStr: string,
    fechaFinStr: string
  ) {
    const mInicio = moment(fechaInicioStr).startOf('day');
    const mFin = moment(fechaFinStr).endOf('day');
    const diasLaborales: string[] = [];

    let aux = mInicio.clone();
    while (aux.isSameOrBefore(mFin)) {
      if (aux.day() !== 0 && aux.day() !== 6) {
        diasLaborales.push(aux.format('YYYY-MM-DD'));
      }
      aux.add(1, 'days');
    }

    const mapaCompleto: { [key: string]: any } = {};

    reglas.filter(r => r.activo).forEach(r => {
      const idKey = this.limpiarId(r.id_empleado);
      mapaCompleto[idKey] = {
        id_empleado: idKey,
        nombre: r.nombre_completo,
        nombreNormalizado: this.limpiarTexto(r.nombre_completo),
        asistencias: {},
        salidasDetectadas: {},
        retardos: {},
        paracaidismo: {},
        limites: {},
        faltasEspeciales: {},
        reglaInicio: r.limite_retardo_inicio ? r.limite_retardo_inicio.substring(0, 5) : '08:00',
        reglaFin: r.limite_retardo_fin ? r.limite_retardo_fin.substring(0, 5) : '16:00'
      };
    });

    const agrupadoPorColaboradorYDia: { [id: string]: { [dia: string]: string[] } } = {};

    dataMarcajes.forEach(reg => {
      const mFechaReg = moment(reg.fecha);
      if (mFechaReg.isSameOrAfter(mInicio) && mFechaReg.isSameOrBefore(mFin)) {
        const fKey = mFechaReg.format('YYYY-MM-DD');
        const idRaw = reg.id_empleado || '';
        const nomRaw = reg.empleado || '';

        const idMatch = Object.keys(mapaCompleto).find(id => {
          const emp = mapaCompleto[id];
          const matchId = id === this.limpiarId(idRaw);
          const matchNom = nomRaw && (
            emp.nombreNormalizado === this.limpiarTexto(nomRaw) ||
            emp.nombreNormalizado.includes(this.limpiarTexto(nomRaw)) ||
            this.limpiarTexto(nomRaw).includes(emp.nombreNormalizado)
          );
          return matchId || matchNom;
        });

        if (idMatch) {
          if (!agrupadoPorColaboradorYDia[idMatch]) agrupadoPorColaboradorYDia[idMatch] = {};
          if (!agrupadoPorColaboradorYDia[idMatch][fKey]) agrupadoPorColaboradorYDia[idMatch][fKey] = [];
          agrupadoPorColaboradorYDia[idMatch][fKey].push(reg.hora.substring(0, 5));
        }
      }
    });

    Object.keys(mapaCompleto).forEach(idEmp => {
      const emp = mapaCompleto[idEmp];
      const diasColaborador = agrupadoPorColaboradorYDia[idEmp] || {};

      diasLaborales.forEach(dia => {
        const checadasDia = diasColaborador[dia];

        if (!checadasDia || checadasDia.length === 0) {
          return;
        }

        checadasDia.sort((a, b) => this.toMins(a) - this.toMins(b));
        const primeraChecada = checadasDia[0];
        const ultimaChecada = checadasDia.length > 1 ? checadasDia[checadasDia.length - 1] : null;

        const minMarcaje = this.toMins(primeraChecada);
        const minEntradaBase = this.toMins(emp.reglaInicio);
        const minToleranciaFin = minEntradaBase + 30;
        const minSalidaJornada = this.toMins(emp.reglaFin);

        // EVALUACIÓN ESTRICTA DE ASISTENCIA A TIEMPO VS INCIDENCIAS
        if (minMarcaje <= minEntradaBase) {
          emp.asistencias[dia] = primeraChecada;
          emp.faltasEspeciales[dia] = 'ANTES_DE_HORA';
        } else if (minMarcaje > minEntradaBase && minMarcaje <= minToleranciaFin) {
          emp.retardos[dia] = primeraChecada;
          emp.faltasEspeciales[dia] = 'RETARDO';
        } else if (minMarcaje > minToleranciaFin && minMarcaje <= minSalidaJornada) {
          emp.paracaidismo[dia] = primeraChecada;
          emp.limites[dia] = primeraChecada;
          emp.faltasEspeciales[dia] = 'PARACAIDISTA';
        } else {
          emp.faltasEspeciales[dia] = 'SALIDA_O_DESPUES';
        }

        if (ultimaChecada && this.toMins(ultimaChecada) >= minSalidaJornada) {
          emp.salidasDetectadas[dia] = ultimaChecada;
        }
      });
    });

    return { resultados: mapaCompleto, diasLaborales };
  }
}