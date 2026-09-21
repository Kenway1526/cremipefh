const XLSX = require('xlsx');
const moment = require('moment');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            body: JSON.stringify({ error: 'Método no permitido. Usa POST.' }) 
        };
    }

    try {
        const isBase64 = event.isBase64Encoded;
        const buffer = Buffer.from(event.body, isBase64 ? 'base64' : 'utf8');
        
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        
        // 💡 Nombre dinámico: siempre agarra la primera hoja sin importar cómo cambie de nombre
        const primeraHojaNombre = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[primeraHojaNombre];

        if (!worksheet) {
            return { statusCode: 400, body: 'No se encontraron hojas válidas en el Excel.' };
        }

        const rawData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            defval: "" 
        });

        if (rawData.length === 0) {
            return { statusCode: 400, body: 'El archivo Excel está vacío.' };
        }

        const headers = rawData[0];
        const dataRows = rawData.slice(1);
        
        const FORMATO_ENTRADA = "YYYY-MM-DD HH:mm:ss";

        const idxName = headers.indexOf('Name');
        const idxDateTime = headers.indexOf('No.');

        const formattedData = dataRows.map((row) => {
            const employeeRaw = row[idxName]?.toString().trim(); 
            const dateTimeValue = row[idxDateTime]?.toString().trim();

            if (!employeeRaw || !dateTimeValue) return null;

            let fullDate;
            const parsedMoment = moment(dateTimeValue, FORMATO_ENTRADA); 

            if (parsedMoment.isValid()) {
                fullDate = parsedMoment.utcOffset(0, true).format(); 
            } else {
                return null; 
            }

            // 💡 EMPATE EXACTO: Mapeamos el contenido directo de 'Name' a 'id_empleado'
            return {
                id_empleado: employeeRaw,
                nombre: employeeRaw, // Mantenemos el mismo valor para ambas propiedades
                fecha: `new Date("${fullDate}")`,
                hora_llegada: `new Date("${fullDate}")`
            };
        }).filter(entry => entry !== null);

        let jsonString = JSON.stringify(formattedData, null, 2);
        
        jsonString = jsonString.replace(/"new Date\(\\"([^\\"]+)\\"\)"/g, 'new Date("$1")');
        jsonString = jsonString.replace(/"(id_empleado|nombre|fecha|hora_llegada)":/g, '$1:');
        jsonString = jsonString.replace(/\{\n\s+id_empleado:/g, '{ id_empleado:');

        const fechaActual = moment().format('DDMM');
        const jsContent = `// Archivo generado automáticamente para Secundaria\n\nmodule.exports = ${jsonString};\n`;

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/javascript",
                "Content-Disposition": `attachment; filename="reportesSecundaria_${fechaActual}.js"`,
                "Access-Control-Allow-Origin": "*"
            },
            body: jsContent
        };

    } 
    catch (error) {
        console.error('Error:', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Error procesando el archivo de Secundaria: ' + error.message }) 
        };
    }
};