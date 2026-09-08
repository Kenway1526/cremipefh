const XLSX = require('xlsx');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE Y PARÁMETROS
// ==========================================
const SUPABASE_URL = 'https://zoomcfvpmpbjbhomwpnw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpvb21jZnZwbXBiamJob213cG53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MjgzMTUsImV4cCI6MjA4NDUwNDMxNX0.R9AmMG0ECQTfsPZzNc6j_olT-LJi2Po3EEwRlVqAbWk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ARCHIVO_EXCEL = '203_StandardReport (2).xlsx';
const PLANTEL_ID = 'toluca';
const SEDE_ID = 'oficinas';
const FECHA_INICIO = '2026-08-17';
const FECHA_FIN = '2026-09-07';

// Mapeo exacto de tablas por sede según tu arquitectura
const TABLAS_SEDES = {
  'toluca_secundaria': 'asistencia_toluca_sec',
  'toluca_oficinas': 'asistencia_toluca_ofi',
  'calimaya_calimaya': 'asistencia_calimaya',
  'aeropuerto_hacienda': 'asistencia_aero_hac',
  'aeropuerto_esquina': 'asistencia_aero_esq'
};

// Normalizador de ID (quita ceros a la izquierda y espacios)
function limpiarId(idRaw) {
  if (!idRaw) return '';
  const str = String(idRaw).trim();
  const num = parseInt(str, 10);
  return isNaN(num) ? str : String(num);
}

// ==========================================
// 2. PARSER DEL EXCEL MATRICIAL
// ==========================================
function parsearExcelMatricial(rawData, fechaInicioStr) {
  let marcajes = [];
  let empleadoActual = null;
  let filaIdIdx = -1;

  const filaDias = rawData[3] || [];
  const mapaColumnasFechas = {};

  const baseDate = moment(fechaInicioStr, 'YYYY-MM-DD');
  let anioCursor = baseDate.year();
  let mesCursor = baseDate.month();
  let diaAnterior = null;

  filaDias.forEach((celda, idx) => {
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
    const tieneId = fila.some((c) => c && c.toString().trim().toUpperCase() === "ID:");

    if (tieneId || fila[0]?.toString().trim().toUpperCase() === "ID:") {
      let idxId = fila.findIndex(c => c && c.toString().trim().toUpperCase() === "ID:");
      const rawId = fila[idxId + 1] || fila[4] || '';
      const idNormalizado = limpiarId(rawId);
      const nombreExtraido = fila[10]?.toString().trim() || fila[9]?.toString().trim() || 'SIN NOMBRE';

      if (idNormalizado) {
        empleadoActual = { id: idNormalizado, nombre: nombreExtraido };
        filaIdIdx = i;
      }
      continue;
    }

    if (empleadoActual && i === filaIdIdx + 1) {
      fila.forEach((celda, colIdx) => {
        const valor = celda?.toString().trim();
        if (valor && valor.includes(':')) {
          const fechaStr = mapaColumnasFechas[colIdx];
          if (fechaStr) {
            const marcajesExtraidos = valor
              .split(/[\n\r\s]+/)
              .map((h) => h.trim())
              .filter((h) => h.includes(':'));

            marcajesExtraidos.forEach((horaLimpia) => {
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

// ==========================================
// 3. MOTOR DE PROCESAMIENTO UNIFICADO POR ID
// ==========================================
function procesar(plantelId, sedeId, dataMemoria, reglas, fechaInicioStr, fechaFinStr) {
  const mInicio = moment(fechaInicioStr).startOf('day');
  const mFin = moment(fechaFinStr).endOf('day');
  const diasLaborales = [];

  let aux = mInicio.clone();
  while (aux.isSameOrBefore(mFin)) {
    if (aux.day() !== 0 && aux.day() !== 6) {
      diasLaborales.push(aux.format('YYYY-MM-DD'));
    }
    aux.add(1, 'days');
  }

  const mapaCompleto = {};

  reglas.filter(r => r.activo).forEach(r => {
    const idKey = limpiarId(r.id_empleado);
    mapaCompleto[idKey] = {
      id_empleado: idKey,
      nombre: r.nombre_completo,
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

  const toMins = (hStr) => {
    if (!hStr || !hStr.includes(':')) return 0;
    const [h, m] = hStr.split(':').map(Number);
    return (h * 60) + m;
  };

  // Agrupar marcajes estrictamente por ID y Fecha
  const agrupadoPorColaboradorYDia = {};

  dataMemoria.forEach(reg => {
    const mFechaReg = moment(reg.fecha);
    if (mFechaReg.isSameOrAfter(mInicio) && mFechaReg.isSameOrBefore(mFin)) {
      const fKey = mFechaReg.format('YYYY-MM-DD');
      const idEmp = limpiarId(reg.id_empleado || reg.id);

      // Cruce estricto por ID universal contra Supabase
      if (mapaCompleto[idEmp]) {
        if (!agrupadoPorColaboradorYDia[idEmp]) agrupadoPorColaboradorYDia[idEmp] = {};
        if (!agrupadoPorColaboradorYDia[idEmp][fKey]) agrupadoPorColaboradorYDia[idEmp][fKey] = [];
        agrupadoPorColaboradorYDia[idEmp][fKey].push(reg.hora.substring(0, 5));
      }
    }
  });

  // Resolver incidencias con base en la primera y última checada del día
  Object.keys(mapaCompleto).forEach(idEmp => {
    const emp = mapaCompleto[idEmp];
    const diasColaborador = agrupadoPorColaboradorYDia[idEmp] || {};

    diasLaborales.forEach(dia => {
      const checadasDia = diasColaborador[dia];

      if (!checadasDia || checadasDia.length === 0) {
        return; // Queda implícitamente como FALTA (F)
      }

      // Ordenar cronológicamente
      checadasDia.sort((a, b) => toMins(a) - toMins(b));
      const primeraChecada = checadasDia[0];
      const ultimaChecada = checadasDia.length > 1 ? checadasDia[checadasDia.length - 1] : null;

      const minMarcaje = toMins(primeraChecada);
      const minEntradaBase = toMins(emp.reglaInicio);
      const minToleranciaFin = minEntradaBase + 30;
      const minSalidaJornada = toMins(emp.reglaFin);

      // EVALUACIÓN ESTRICTA
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

      if (ultimaChecada && toMins(ultimaChecada) >= minSalidaJornada) {
        emp.salidasDetectadas[dia] = ultimaChecada;
      }
    });
  });

  return { resultados: mapaCompleto, diasLaborales };
}

// ==========================================
// 4. EJECUCIÓN PRINCIPAL ASÍNCRONA
// ==========================================
async function run() {
  console.log('🚀 Iniciando Test Runner conectado a Supabase...\n');

  const keySede = `${PLANTEL_ID}_${SEDE_ID}`;
  const nombreTabla = TABLAS_SEDES[keySede];

  if (!nombreTabla) {
    console.error(`❌ No existe una tabla mapeada para: "${keySede}"`);
    return;
  }

  console.log(`📡 Consultando Supabase en la tabla: "${nombreTabla}"...`);
  const { data: reglasDb, error } = await supabase.from(nombreTabla).select('*');

  if (error) {
    console.error('❌ Error al consultar Supabase:', error.message);
    return;
  }

  console.log(`✅ Reglas recuperadas de ${nombreTabla}: ${reglasDb ? reglasDb.length : 0} registros.`);
  if (!reglasDb || reglasDb.length === 0) return;

  const rutaCompleta = path.join(__dirname, ARCHIVO_EXCEL);
  if (!fs.existsSync(rutaCompleta)) {
    console.error(`❌ No se encontró el archivo Excel en: ${rutaCompleta}`);
    return;
  }

  const workbook = XLSX.readFile(rutaCompleta);
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('asistencia')) 
                 || (workbook.SheetNames.length > 2 ? workbook.SheetNames[2] : workbook.SheetNames[0]);
  
  console.log(`📄 Leyendo hoja de asistencia: "${sheetName}"`);
  const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  const marcajesEnMemoria = parsearExcelMatricial(rawData, FECHA_INICIO);
  console.log(`⚡ Marcajes parseados del Excel: ${marcajesEnMemoria.length}`);

  const idsExcel = new Set(marcajesEnMemoria.map(m => m.id_empleado));
  const idsSupabase = new Set(reglasDb.map(r => limpiarId(r.id_empleado)));
  
  console.log(`\n🔍 AUDITORÍA DE MATCH POR ID:`);
  console.log(`- IDs únicos en el Excel: ${idsExcel.size}`);
  console.log(`- IDs únicos en Supabase: ${idsSupabase.size}`);
  
  const matches = [...idsExcel].filter(id => idsSupabase.has(id));
  console.log(`🎯 IDs que coincidieron: ${matches.length}`);
  
  const noEncontradosEnDb = [...idsExcel].filter(id => !idsSupabase.has(id));
  if (noEncontradosEnDb.length > 0) {
    console.warn(`⚠️ IDs del Excel ausentes en Supabase (${noEncontradosEnDb.length}):`, noEncontradosEnDb);
  }

  const resultadoFinal = procesar(
    PLANTEL_ID,
    SEDE_ID,
    marcajesEnMemoria,
    reglasDb,
    FECHA_INICIO,
    FECHA_FIN
  );

  fs.writeFileSync(
    path.join(__dirname, '03_resultado_final.json'),
    JSON.stringify(resultadoFinal, null, 2)
  );

  console.log(`\n✅ Archivo generado: 03_resultado_final.json`);
  console.log(`Días laborales calculados: ${resultadoFinal.diasLaborales.length}`);
  console.log(`Total empleados en la matriz final: ${Object.keys(resultadoFinal.resultados).length}\n`);
}

run();