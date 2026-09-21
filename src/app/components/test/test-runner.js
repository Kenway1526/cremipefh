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

const TABLAS_SEDES = {
  'toluca_secundaria': 'asistencia_toluca_sec',
  'toluca_oficinas': 'asistencia_toluca_ofi',
  'calimaya_calimaya': 'asistencia_calimaya',
  'aeropuerto_hacienda': 'asistencia_aero_hac',
  'aeropuerto_esquina': 'asistencia_aero_esq'
};

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
// 3. MOTOR DE EVALUACIÓN DE ENTRADA Y SALIDA
// ==========================================
function procesar(dataMemoria, reglas, fechaInicioStr, fechaFinStr) {
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

  // Inicializar empleados con base en Supabase
  const resultadoEmpleados = {};

  reglas.filter(r => r.activo).forEach(r => {
    const idKey = limpiarId(r.id_empleado);
    resultadoEmpleados[idKey] = {
      id_empleado: idKey,
      nombre: r.nombre_completo,
      horario_base: {
        entrada_oficial: r.limite_retardo_inicio ? r.limite_retardo_inicio.substring(0, 5) : '08:00',
        salida_oficial: r.limite_retardo_fin ? r.limite_retardo_fin.substring(0, 5) : '16:00'
      },
      dias: {}
    };

    agrupadoPorColaboradorYDia[idKey] = {};
    diasLaborales.forEach(dia => {
      agrupadoPorColaboradorYDia[idKey][dia] = [];
    });
  });

  // Agrupar checadas sin duplicados exactos
  dataMemoria.forEach(reg => {
    const mFechaReg = moment(reg.fecha);
    if (mFechaReg.isSameOrAfter(mInicio) && mFechaReg.isSameOrBefore(mFin)) {
      const fKey = mFechaReg.format('YYYY-MM-DD');
      const idEmp = limpiarId(reg.id_empleado || reg.id);

      if (agrupadoPorColaboradorYDia[idEmp] && agrupadoPorColaboradorYDia[idEmp][fKey]) {
        const horaLimpia = reg.hora.substring(0, 5);
        if (!agrupadoPorColaboradorYDia[idEmp][fKey].includes(horaLimpia)) {
          agrupadoPorColaboradorYDia[idEmp][fKey].push(horaLimpia);
        }
      }
    }
  });

  // Evaluar estatus por día para cada colaborador
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

      // La primera checada siempre corresponde al marcaje de entrada
      const primeraChecada = checadas[0];
      const minPrimeraChecada = toMins(primeraChecada);

      // Evaluación de entrada: A tiempo vs Retardo
      const estatusEntrada = minPrimeraChecada <= minEntradaOficial ? 'A_TIEMPO' : 'RETARDO';

      let horaSalida = null;

      if (checadas.length > 1) {
        const ultimaChecada = checadas[checadas.length - 1];
        const minUltimaChecada = toMins(ultimaChecada);

        // Descartar falsas salidas: debe haber al menos 30 minutos de diferencia respecto a la entrada
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
  console.log('🚀 Iniciando análisis de entradas, retardos y salidas...\n');

  const keySede = `${PLANTEL_ID}_${SEDE_ID}`;
  const nombreTabla = TABLAS_SEDES[keySede];

  if (!nombreTabla) {
    console.error(`❌ No existe una tabla mapeada para: "${keySede}"`);
    return;
  }

  const { data: reglasDb, error } = await supabase.from(nombreTabla).select('*');

  if (error) {
    console.error('❌ Error al consultar Supabase:', error.message);
    return;
  }

  if (!reglasDb || reglasDb.length === 0) {
    console.warn('⚠️ No se encontraron empleados registrados en Supabase.');
    return;
  }

  const rutaCompleta = path.join(__dirname, ARCHIVO_EXCEL);
  if (!fs.existsSync(rutaCompleta)) {
    console.error(`❌ No se encontró el archivo Excel en: ${rutaCompleta}`);
    return;
  }

  const workbook = XLSX.readFile(rutaCompleta);
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('asistencia')) 
                 || (workbook.SheetNames.length > 2 ? workbook.SheetNames[2] : workbook.SheetNames[0]);
  
  const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  const marcajesEnMemoria = parsearExcelMatricial(rawData, FECHA_INICIO);

  const resultadoFinal = procesar(
    marcajesEnMemoria,
    reglasDb,
    FECHA_INICIO,
    FECHA_FIN
  );

  fs.writeFileSync(
    path.join(__dirname, '03_resultado_final.json'),
    JSON.stringify(resultadoFinal, null, 2)
  );

  console.log('✅ Archivo generado: 03_resultado_final.json');
  console.log(`Días evaluados: ${resultadoFinal.diasLaborales.length}`);
  console.log(`Empleados evaluados: ${Object.keys(resultadoFinal.resultados).length}\n`);
}

run();