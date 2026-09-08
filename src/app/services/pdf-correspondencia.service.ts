import { Injectable } from '@angular/core';
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';

export interface IncidenciaColaborador {
  idEmpleado: string;
  nombreCompleto: string;
  horaEntradaProgramada: string; // Ej: "07:00"
  mesAnio: string;               // Ej: "SEPTIEMBRE 2026"
  totalRetardos: number;
  totalFaltas: number;
  // Lista de horas o fechas exactas de las incidencias (ej: ["07:14", "07:21", "FALTA"])
  horasIncidencias: string[];
}

@Injectable({
  providedIn: 'root'
})
export class PdfCorrespondenciaService {

  /**
   * Genera el PDF consolidado imprimiendo 2 actas por hoja carta.
   * Filtra automáticamente solo los que tengan faltas >= 1 o retardos >= 1.
   */
  async generarReportesCorrespondencia(listaEmpleados: IncidenciaColaborador[]): Promise<void> {
    // 1. Filtrar únicamente a los que tienen al menos 1 falta o 1 retardo
    const candidatos = listaEmpleados.filter(e => (e.totalFaltas >= 1 || e.totalRetardos >= 1));

    if (candidatos.length === 0) {
      throw new Error('No hay colaboradores con faltas o retardos para generar reporte.');
    }

    // 2. Crear documento PDF en blanco
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Dimensiones tamaño Carta estándar (Letter): 612 x 792 pt
    const pageWidth = 612;
    const pageHeight = 792;
    const halfHeight = pageHeight / 2; // 396 pt cada mitad

    // 3. Procesar de 2 en 2 colaboradores por página
    for (let i = 0; i < candidatos.length; i += 2) {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      // Formato superior (índice i)
      this.dibujarFormatoIndividual(
        page, 
        candidatos[i], 
        pageHeight - 15, // Y inicial superior
        fontBold, 
        fontRegular
      );

      // Formato inferior (índice i + 1, si existe)
      if (i + 1 < candidatos.length) {
        this.dibujarFormatoIndividual(
          page, 
          candidatos[i + 1], 
          halfHeight - 15, // Y inicial inferior
          fontBold, 
          fontRegular
        );
      }

      // Línea punteada de corte central si hay dos registros en la misma hoja
      if (i + 1 < candidatos.length) {
        page.drawLine({
          start: { x: 20, y: halfHeight },
          end: { x: pageWidth - 20, y: halfHeight },
          thickness: 0.8,
          color: rgb(0.6, 0.6, 0.6),
          dashArray: [4, 4]
        });
      }
    }

    // 4. Descargar el archivo combinado resultante
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reportes_Asistencia_${new Date().getTime()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Renderiza el diseño exacto de una ficha de correspondencia
   */
  private dibujarFormatoIndividual(
    page: PDFPage,
    data: IncidenciaColaborador,
    topY: number,
    fontBold: PDFFont,
    fontRegular: PDFFont
  ): void {
    const leftX = 40;
    const rightX = 572;
    const boxWidth = rightX - leftX; // 532 pt
    const alturaFicha = 350;
    const bottomY = topY - alturaFicha;

    const colorAzulHeader = rgb(0.04, 0.28, 0.52);
    const colorNegro = rgb(0.1, 0.1, 0.1);

    // 1. Recuadro exterior principal
    page.drawRectangle({
      x: leftX,
      y: bottomY,
      width: boxWidth,
      height: alturaFicha,
      borderColor: colorNegro,
      borderWidth: 1,
    });

    // 2. Encabezado institucional
    this.drawCenteredText(page, 'REPORTE DE ASISTENCIA', topY - 28, fontBold, 16, colorNegro, leftX, rightX);
    this.drawCenteredText(page, 'INSTITUTO PROFESIONAL EN LA ENSEÑANZA Y FORMACION HUMANA S.C.', topY - 42, fontBold, 8.5, colorNegro, leftX, rightX);

    // Líneas decorativas superiores
    page.drawLine({
      start: { x: leftX + 30, y: topY - 50 },
      end: { x: rightX - 30, y: topY - 50 },
      thickness: 2,
      color: colorAzulHeader,
    });
    page.drawLine({
      start: { x: leftX + 30, y: topY - 56 },
      end: { x: rightX - 30, y: topY - 56 },
      thickness: 3.5,
      color: rgb(0.05, 0.15, 0.3),
    });

    // 3. Cajas: No. de Empleado y Nombre
    const yCajas = topY - 128;
    const altoCajas = 54;

    // Caja Izquierda: No. de Empleado
    const wCajaId = 135;
    page.drawRectangle({
      x: leftX + 30,
      y: yCajas,
      width: wCajaId,
      height: altoCajas,
      borderColor: colorNegro,
      borderWidth: 1,
    });
    this.drawCenteredText(page, 'No. de empleado', yCajas + 36, fontBold, 11, colorNegro, leftX + 30, leftX + 30 + wCajaId);
    this.drawCenteredText(page, data.idEmpleado, yCajas + 15, fontBold, 12, colorNegro, leftX + 30, leftX + 30 + wCajaId);

    // Caja Derecha: Nombre
    const xCajaNombre = leftX + 185;
    const wCajaNombre = 317;
    page.drawRectangle({
      x: xCajaNombre,
      y: yCajas,
      width: wCajaNombre,
      height: altoCajas,
      borderColor: colorNegro,
      borderWidth: 1,
    });
    this.drawCenteredText(page, 'Nombre', yCajas + 36, fontBold, 11, colorNegro, xCajaNombre, xCajaNombre + wCajaNombre);
    this.drawCenteredText(page, data.nombreCompleto.toUpperCase(), yCajas + 15, fontBold, 11, colorNegro, xCajaNombre, xCajaNombre + wCajaNombre);

    // 4. Subtítulo: Retardos y Horario de Entrada
    const textoEntrada = `Retardos (Hora de Entrada: ${data.horaEntradaProgramada || '07:00'})`;
    this.drawCenteredText(page, textoEntrada, topY - 150, fontBold, 11, colorNegro, leftX, rightX);

    // 5. Caja central de incidencias (con 2 columnas)
    const yCajaIncidencias = topY - 268;
    const altoCajaIncidencias = 108;
    const xCajaIncidencias = leftX + 30;
    const wCajaIncidencias = boxWidth - 60;

    page.drawRectangle({
      x: xCajaIncidencias,
      y: yCajaIncidencias,
      width: wCajaIncidencias,
      height: altoCajaIncidencias,
      borderColor: colorNegro,
      borderWidth: 1,
    });

    // Mes y Año en la parte superior del recuadro
    this.drawCenteredText(
      page, 
      data.mesAnio.toUpperCase(), 
      yCajaIncidencias + altoCajaIncidencias - 18, 
      fontBold, 
      11, 
      colorNegro, 
      xCajaIncidencias, 
      xCajaIncidencias + wCajaIncidencias
    );

    // 6. Listado dinámico de incidencias (Solo numera las que existen)
    // Se distribuyen en dos columnas: Columna A (pares/impares) y Columna B
    const col1X = xCajaIncidencias + 90;
    const col2X = xCajaIncidencias + 290;
    let lineaY = yCajaIncidencias + altoCajaIncidencias - 34;

    const items = data.horasIncidencias || [];
    for (let idx = 0; idx < items.length; idx += 2) {
      // Elemento Columna 1
      const item1 = `${idx + 1}. ${items[idx]}`;
      page.drawText(item1, {
        x: col1X,
        y: lineaY,
        size: 10,
        font: fontBold,
        color: colorNegro,
      });

      // Elemento Columna 2 (si existe)
      if (idx + 1 < items.length) {
        const item2 = `${idx + 2}. ${items[idx + 1]}`;
        page.drawText(item2, {
          x: col2X,
          y: lineaY,
          size: 10,
          font: fontBold,
          color: colorNegro,
        });
      }

      lineaY -= 12; // Espaciado entre filas
      if (lineaY < yCajaIncidencias + 8) break; // Límite de seguridad dentro del recuadro
    }

    // 7. Pie de firma
    const yFirma = bottomY + 28;
    page.drawLine({
      start: { x: leftX + 30, y: yFirma + 16 },
      end: { x: rightX - 30, y: yFirma + 16 },
      thickness: 0.8,
      color: colorNegro,
    });

    this.drawCenteredText(page, 'FIRMA DE CONFORMIDAD Y ENTERADO', yFirma + 5, fontBold, 9.5, colorNegro, leftX, rightX);
    this.drawCenteredText(page, '(NOMBRE COMPLETO DEL EMPLEADO Y FIRMA)', yFirma - 6, fontBold, 9.5, colorNegro, leftX, rightX);
  }

  /**
   * Utilidad para centrar texto dentro de un rango horizontal (minX a maxX)
   */
  private drawCenteredText(
    page: PDFPage,
    text: string,
    y: number,
    font: PDFFont,
    size: number,
    color: any,
    minX: number,
    maxX: number
  ): void {
    const textWidth = font.widthOfTextAtSize(text, size);
    const x = minX + (maxX - minX - textWidth) / 2;
    page.drawText(text, { x, y, size, font, color });
  }
}