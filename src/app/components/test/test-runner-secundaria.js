const XLSX = require('xlsx');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const SUPABASE_URL = 'https://zoomcfvpmpbjbhomwpnw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpvb21jZnZwbXBiamJob213cG53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MjgzMTUsImV4cCI6MjA4NDUwNDMxNX0.R9AmMG0ECQTfsPZzNc6j_olT-LJi2Po3EEwRlVqAbWk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ARCHIVO_EXCEL = '22may05jun.xls'; 
const PLANTEL_ID = 'toluca';
const SEDE_ID = 'secundaria';
const TABLA_SUPABASE = 'asistencia_toluca_sec';

const FECHA_INICIO = '2026-05-22';
const FECHA_FIN = '2026-06-05';

function limpiarId(idRaw) {
  if (!idRaw) return '';
  const str = String(idRaw).trim();
  const num = parseInt(str, 10);
  return isNaN(num) ? str : String(num);
}

// ==========================================
// 2. PARSER VERTICAL CON COLUMNAS FIJAS ("Hoja1", No. y Date/Time)
// ==========================================
function parsearExcelSecundaria(rawData) {
  if (!rawData || rawData.length === 0) return [];

  // Según el formato visual confirmado:
  // Columna 2 (C) = "No." (ID del empleado)
  // Columna 3 (D) = "Date/Time" (Fecha y hora del marcaje)
  const idIdx = 2; 
  const dIdx = 3;  

  console.log(`📋 Leyendo Secundaria columnas fijas: ID en [col ${idIdx}] ("No."), Fecha/Hora en [col ${dIdx}] ("Date/Time")`);

  const marcajes = [];
  const filasDatos = rawData.slice(1); // Omitir la fila 0 de encabezados

  filasDatos.forEach((row) => {
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
      let fechaStr = valFecha.toString().trim()
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
        id_empleado: limpiarId(valId), // ID universal extraído de "No."
        fechaDate: mFecha.toDate(),
        fechaStr: mFecha.format('YYYY-MM-DD'),
        hora: mFecha.format('HH:mm')
      });
    }
  });

  console.log(`⚡ Marcajes válidos parseados: ${marcajes.length}`);
  return marcajes;
}

// ==========================================
// 3. MOTOR DE PROCESAMIENTO ESTRICTO POR ID
// ==========================================
function procesarSecundaria(dataMemoria, reglas, fechaInicioStr, fechaFinStr) {
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
      reglaInicio: r.limite_retardo_inicio ? r.limite_retardo_inicio.substring(0, 5) : '07:00',
      reglaFin: r.limite_retardo_fin ? r.limite_retardo_fin.substring(0, 5) : '15:00'
    };
  });

  const toMins = (hStr) => {
    if (!hStr || !hStr.includes(':')) return 0;
    const [h, m] = hStr.split(':').map(Number);
    return (h * 60) + m;
  };

  const agrupadoPorColaboradorYDia = {};
  dataMemoria.forEach(reg => {
    const mFechaReg = moment(reg.fechaDate);
    if (mFechaReg.isSameOrAfter(mInicio) && mFechaReg.isSameOrBefore(mFin)) {
      const fKey = reg.fechaStr;
      const idEmp = limpiarId(reg.id_empleado);

      // Cruce estricto por ID universal contra Supabase
      if (mapaCompleto[idEmp]) {
        if (!agrupadoPorColaboradorYDia[idEmp]) agrupadoPorColaboradorYDia[idEmp] = {};
        if (!agrupadoPorColaboradorYDia[idEmp][fKey]) agrupadoPorColaboradorYDia[idEmp][fKey] = [];
        agrupadoPorColaboradorYDia[idEmp][fKey].push(reg.hora);
      }
    }
  });

  Object.keys(mapaCompleto).forEach(idEmp => {
    const emp = mapaCompleto[idEmp];
    const diasColaborador = agrupadoPorColaboradorYDia[idEmp] || {};

    diasLaborales.forEach(dia => {
      const checadasDia = diasColaborador[dia];
      if (!checadasDia || checadasDia.length === 0) return;

      checadasDia.sort((a, b) => toMins(a) - toMins(b));
      const primeraChecada = checadasDia[0];
      const ultimaChecada = checadasDia.length > 1 ? checadasDia[checadasDia.length - 1] : null;

      const minMarcaje = toMins(primeraChecada);
      const minEntradaBase = toMins(emp.reglaInicio);
      const minToleranciaFin = minEntradaBase + 30;
      const minSalidaJornada = toMins(emp.reglaFin);

      // Evaluación estricta de asistencia a tiempo vs incidencias
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
// 4. EJECUCIÓN PRINCIPAL
// ==========================================
async function run() {
  console.log('🚀 Iniciando Test Runner Secundaria Toluca...\n');

  const { data: reglasDb, error } = await supabase.from(TABLA_SUPABASE).select('*');
  if (error) {
    console.error('❌ Error Supabase:', error.message);
    return;
  }
  console.log(`✅ Reglas recuperadas: ${reglasDb.length} registros.`);

  const rutaCompleta = path.join(__dirname, ARCHIVO_EXCEL);
  const workbook = XLSX.readFile(rutaCompleta, { cellDates: true });
  
  // Selección de hoja fija: Busca explícitamente "Hoja1" o toma la primera disponible
  const sheetName = workbook.SheetNames.includes('Hoja1') ? 'Hoja1' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  console.log(`📄 Leyendo hoja: "${sheetName}"`);

  let maxRow = 0, maxCol = 0;
  Object.keys(sheet).forEach(key => {
    if (key.startsWith('!')) return;
    const addr = XLSX.utils.decode_cell(key);
    if (addr.r > maxRow) maxRow = addr.r;
    if (addr.c > maxCol) maxCol = addr.c;
  });
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });

  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  console.log(`📏 Filas totales reales leídas en hoja: ${rawData.length}`);

  const marcajesEnMemoria = parsearExcelSecundaria(rawData);

  // Auditoría rápida de match por ID
  const idsExcel = new Set(marcajesEnMemoria.map(m => m.id_empleado));
  const idsSupabase = new Set(reglasDb.map(r => limpiarId(r.id_empleado)));
  const matches = [...idsExcel].filter(id => idsSupabase.has(id));
  console.log(`🎯 IDs que coincidieron con Supabase: ${matches.length} de ${idsExcel.size} únicos en Excel.\n`);

  const resultadoFinal = procesarSecundaria(marcajesEnMemoria, reglasDb || [], FECHA_INICIO, FECHA_FIN);

  fs.writeFileSync(path.join(__dirname, '03_resultado_final.json'), JSON.stringify(resultadoFinal, null, 2));
  console.log('✅ Archivo generado: 03_resultado_final.json con éxito.');
}

run();