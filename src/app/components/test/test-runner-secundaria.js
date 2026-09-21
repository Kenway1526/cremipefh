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

  const idIdx = 2; 
  const dIdx = 3;  

  console.log(`📋 Leyendo Secundaria columnas fijas: ID en [col ${idIdx}] ("No."), Fecha/Hora en [col ${dIdx}] ("Date/Time")`);

  const marcajes = [];
  const filasDatos = rawData.slice(1);

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
        id_empleado: limpiarId(valId),
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
// 3. MOTOR DE EVALUACIÓN DE ENTRADA Y SALIDA (SECUNDARIA)
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

  const toMins = (hStr) => {
    if (!hStr || !hStr.includes(':')) return 0;
    const [h, m] = hStr.split(':').map(Number);
    return (h * 60) + m;
  };

  const agrupadoPorColaboradorYDia = {};
  const resultadoEmpleados = {};

  // Inicializar empleados con base en Supabase (horario base secundaria: 07:00 - 15:00)
  reglas.filter(r => r.activo).forEach(r => {
    const idKey = limpiarId(r.id_empleado);
    resultadoEmpleados[idKey] = {
      id_empleado: idKey,
      nombre: r.nombre_completo,
      horario_base: {
        entrada_oficial: r.limite_retardo_inicio ? r.limite_retardo_inicio.substring(0, 5) : '07:00',
        salida_oficial: r.limite_retardo_fin ? r.limite_retardo_fin.substring(0, 5) : '15:00'
      },
      dias: {}
    };

    agrupadoPorColaboradorYDia[idKey] = {};
    diasLaborales.forEach(dia => {
      agrupadoPorColaboradorYDia[idKey][dia] = [];
    });
  });

  // Agrupar marcajes sin duplicados exactos
  dataMemoria.forEach(reg => {
    const mFechaReg = moment(reg.fechaDate);
    if (mFechaReg.isSameOrAfter(mInicio) && mFechaReg.isSameOrBefore(mFin)) {
      const fKey = reg.fechaStr;
      const idEmp = limpiarId(reg.id_empleado);

      if (agrupadoPorColaboradorYDia[idEmp] && agrupadoPorColaboradorYDia[idEmp][fKey]) {
        const horaLimpia = reg.hora.substring(0, 5);
        if (!agrupadoPorColaboradorYDia[idEmp][fKey].includes(horaLimpia)) {
          agrupadoPorColaboradorYDia[idEmp][fKey].push(horaLimpia);
        }
      }
    }
  });

  // Evaluar cada día laboral para cada colaborador
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

      // Evaluación de entrada: A tiempo vs Retardo
      const estatusEntrada = minPrimeraChecada <= minEntradaOficial ? 'A_TIEMPO' : 'RETARDO';

      let horaSalida = null;

      if (checadas.length > 1) {
        const ultimaChecada = checadas[checadas.length - 1];
        const minUltimaChecada = toMins(ultimaChecada);

        // Descartar rebotes o checadas casi idénticas a la entrada (mínimo 30 min de diferencia)
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

  return {
    diasLaborales,
    resultados: resultadoEmpleados
  };
}

// ==========================================
// 4. EJECUCIÓN PRINCIPAL
// ==========================================
async function run() {
  console.log('🚀 Iniciando Test Runner Secundaria Toluca (Entradas, Retardos y Salidas)...\n');

  const { data: reglasDb, error } = await supabase.from(TABLA_SUPABASE).select('*');
  if (error) {
    console.error('❌ Error Supabase:', error.message);
    return;
  }
  console.log(`✅ Reglas recuperadas: ${reglasDb.length} registros.`);

  const rutaCompleta = path.join(__dirname, ARCHIVO_EXCEL);
  if (!fs.existsSync(rutaCompleta)) {
    console.error(`❌ No se encontró el archivo Excel en: ${rutaCompleta}`);
    return;
  }

  const workbook = XLSX.readFile(rutaCompleta, { cellDates: true });
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
  console.log(`📏 Filas totales leídas: ${rawData.length}`);

  const marcajesEnMemoria = parsearExcelSecundaria(rawData);

  const idsExcel = new Set(marcajesEnMemoria.map(m => m.id_empleado));
  const idsSupabase = new Set(reglasDb.map(r => limpiarId(r.id_empleado)));
  const matches = [...idsExcel].filter(id => idsSupabase.has(id));
  console.log(`🎯 IDs que coincidieron con Supabase: ${matches.length} de ${idsExcel.size} únicos en Excel.\n`);

  const resultadoFinal = procesarSecundaria(marcajesEnMemoria, reglasDb || [], FECHA_INICIO, FECHA_FIN);

  fs.writeFileSync(path.join(__dirname, '03_resultado_final.json'), JSON.stringify(resultadoFinal, null, 2));
  console.log('✅ Archivo generado: 03_resultado_final.json con éxito.');
  console.log(`Días evaluados: ${resultadoFinal.diasLaborales.length}`);
  console.log(`Empleados evaluados: ${Object.keys(resultadoFinal.resultados).length}\n`);
}

run();