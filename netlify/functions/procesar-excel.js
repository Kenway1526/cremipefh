const XLSX = require('xlsx');
const moment = require('moment');

exports.handler = async (event, context) => {
    // 1. Validación de seguridad y método
    if (event.httpMethod !== 'POST') 
    {
        return { 
            statusCode: 405, 
            body: JSON.stringify({ error: 'Método no permitido. Usa POST.' }) 
        };
    }

    try 
    {
        // 2. Extracción del archivo (Netlify recibe el body en base64)
        const isBase64 = event.isBase64Encoded;
        const buffer = Buffer.from(event.body, isBase64 ? 'base64' : 'utf8');
        
        // 3. Lectura del Excel desde memoria (no desde disco)
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const SHEET_NAME = 'Hoja 1'; 
        const worksheet = workbook.Sheets[SHEET_NAME];

        if (!worksheet)return { statusCode: 400, body: 'No se encontró la Hoja 1 en el Excel.' };

        const rawData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            defval: "" 
        });

        const headers = rawData[0];
        const dataRows = rawData.slice(1);
        const FORMATO_ENTRADA = "DD/MM/YYYY hh:mm:ss a";

        // 4. Lógica de procesamiento (Tu convertidor.js original)
        const formattedData = dataRows.map((row, index) => {
            const employeeName = row[headers.indexOf('Name')]; 
            const dateTimeValue = row[headers.indexOf('Date/Time')];

            if (!employeeName || !dateTimeValue) return null;

            let fullDate;
            const parsedMoment = moment(dateTimeValue, FORMATO_ENTRADA, 'es', false); 

            if (parsedMoment.isValid())fullDate = parsedMoment.utcOffset(0, true).format(); 
            else return null; 

            return {
                empleado: employeeName,
                fecha: `new Date("${fullDate}")`,
                hora_llegada: `new Date("${fullDate}")`
            };
        }).filter(entry => entry !== null);

        // 5. Generación del String de salida (Formato JS)
        let jsonString = JSON.stringify(formattedData, null, 2);
        
        // Limpieza de strings para que queden como ejecutables de JS (tu lógica RegEx)
        jsonString = jsonString.replace(/"new Date\(\\"([^\\"]+)\\"\)"/g, 'new Date("$1")');
        jsonString = jsonString.replace(/"(empleado|fecha|hora_llegada)":/g, '$1:');
        jsonString = jsonString.replace(/\{\n\s+empleado:/g, '{ empleado:');

        const fechaActual = moment().format('DDMM');
        const jsContent = `// Archivo generado automáticamente\n\nmodule.exports = ${jsonString};\n`;

        // 6. Respuesta del "Servidor": Dispara descarga de archivo en el navegador
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/javascript",
                "Content-Disposition": `attachment; filename="reportes${fechaActual}.js"`,
                "Access-Control-Allow-Origin": "*" // Importante para que Angular pueda llamarlo
            },
            body: jsContent
        };

    } 
    catch (error) 
    {
        console.error('Error:', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Error procesando el archivo: ' + error.message }) 
        };
    }
};