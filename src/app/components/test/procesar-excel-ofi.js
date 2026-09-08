const XLSX = require('xlsx');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Método no permitido' };
    }

    try {
        const data = JSON.parse(event.body);
        const workbook = XLSX.read(data.file, { type: 'base64' });
        const sheet = workbook.Sheets["Reporte de Asistencia"]; 
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        const filaDiasEncabezado = rawData[3]; // Fila 4 del Excel con los números de días reales
        const resultadosJson = [];
        let empleadoActual = null;

        for (let i = 0; i < rawData.length; i++) {
            const fila = rawData[i];

            // 💡 Detección robusta: buscamos "ID:" barriendo las primeras columnas por si hay celdas combinadas
            const tieneIdToken = fila.some(celda => celda && celda.toString().trim().toUpperCase() === "ID:");

            if (tieneIdToken) {
                // Buscamos dinámicamente los valores para no depender de índices rígidos si se desfasan
                const idxId = fila.findIndex(c => c && c.toString().trim().toUpperCase() === "ID:");
                
                // Extraemos el ID que está unas celdas más adelante (columna E / índice 4)
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

            // Extracción de marcajes en la fila consecuente e inmediata
            if (empleadoActual && i === empleadoActual.filaIdx + 1) {
                for (let col = 0; col <= 30; col++) {
                    const celda = fila[col]?.toString().trim();
                    
                    if (celda && celda.includes(':')) {
                        const diaReal = filaDiasEncabezado[col]?.toString().trim();

                        if (diaReal) {
                            resultadosJson.push({
                                id_empleado: empleadoActual.id_excel,
                                nombre: empleadoActual.nombre_excel,
                                dia: Number(diaReal),
                                entrada: celda.substring(0, 5) 
                            });
                        }
                    }
                }
                // 🔥 LIMPIEZA OBLIGATORIA: Rompemos el candado para obligar al ciclo a leer el siguiente ID real
                empleadoActual = null; 
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify(resultadosJson)
        };
    } catch (error) {
        return { statusCode: 500, body: error.toString() };
    }
};