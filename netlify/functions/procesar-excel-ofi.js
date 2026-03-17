const XLSX = require('xlsx');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Método no permitido' };
    }

    try {
        const data = JSON.parse(event.body);
        const workbook = XLSX.read(data.file, { type: 'base64' });
        const sheet = workbook.Sheets["Reporte de Asistencia"]; // Hoja específica
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        const resultadosJson = [];
        let empleadoActual = null;

        for (let i = 0; i < rawData.length; i++) {
            const fila = rawData[i];

            // Detección de ID en Columna A, extracción de ID en Columna E
            if (fila[0] && fila[0].toString().trim().toUpperCase() === "ID:") {
                empleadoActual = {
                    id_excel: fila[4]?.toString().trim(), 
                    nombre_excel: fila[10]?.toString().trim(), 
                    filaIdx: i
                };
                continue;
            }

            // Extracción de marcajes en la fila consecuente
            if (empleadoActual && i === empleadoActual.filaIdx + 1) {
                for (let col = 0; col <= 20; col++) { // Rango extendido de días
                    const celda = fila[col]?.toString().trim();
                    if (celda && celda.includes(':')) {
                        resultadosJson.push({
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

        return {
            statusCode: 200,
            body: JSON.stringify(resultadosJson)
        };
    } catch (error) {
        return { statusCode: 500, body: error.toString() };
    }
};