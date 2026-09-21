import { Injectable } from '@angular/core';
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';

export interface IncidenciaColaborador {
  numeroEmpleado: string;
  nombreCompleto: string;
  horaEntradaProgramada: string; // Ej: "07:00"
  mesAnio: string;               // Ej: "AGOSTO 2026"
  razonSocial: string;           // Razón social dinámica por plantel
  horasIncidencias: string[];    // Ej: ["17/08/2026 - 07:15", "18/08/2026 - FALTA"]
}

@Injectable({
  providedIn: 'root'
})
export class PdfCorrespondenciaService {

  /**
   * Genera el PDF consolidado imprimiendo exactamente 2 actas por hoja carta.
   * Filtra automáticamente colaboradores que tengan al menos 1 incidencia no justificada.
   */
  async generarReportesCorrespondencia(listaEmpleados: IncidenciaColaborador[]): Promise<void> {
    // 1. Filtrar únicamente a los que tengan incidencias válidas
    const candidatos = listaEmpleados.filter(e => e.horasIncidencias && e.horasIncidencias.length > 0);

    if (candidatos.length === 0) {
      throw new Error('No hay colaboradores con incidencias pendientes para generar reporte.');
    }

    // 2. Crear documento PDF
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Dimensiones Carta (Letter): 612 x 792 pt
    const pageWidth = 612;
    const pageHeight = 792;
    const halfHeight = pageHeight / 2; // 396 pt mitad exacta

    // 3. Procesar de 2 en 2 colaboradores por hoja
    for (let i = 0; i < candidatos.length; i += 2) {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      // Formato superior
      this.dibujarFormatoIndividual(
        page, 
        candidatos[i], 
        pageHeight - 20, 
        fontBold, 
        fontRegular
      );

      // Formato inferior (si existe un segundo empleado para el par)
      if (i + 1 < candidatos.length) {
        this.dibujarFormatoIndividual(
          page, 
          candidatos[i + 1], 
          halfHeight - 10, 
          fontBold, 
          fontRegular
        );

        // Línea punteada de corte central
        page.drawLine({
          start: { x: 30, y: halfHeight },
          end: { x: pageWidth - 30, y: halfHeight },
          thickness: 0.8,
          color: rgb(0.6, 0.6, 0.6),
          dashArray: [4, 4]
        });
      }
    }

    // 4. Descargar el archivo PDF
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
    const alturaFicha = 356;
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

    // 2. Encabezado institucional con Razón Social Dinámica
    this.drawCenteredText(page, 'REPORTE DE ASISTENCIA', topY - 24, fontBold, 15, colorNegro, leftX, rightX);
    
    const razonSocialTexto = (data.razonSocial || 'INSTITUTO PROFESIONAL EN LA ENSEÑANZA Y FORMACION HUMANA S.C.').toUpperCase();
    this.drawCenteredText(page, razonSocialTexto, topY - 38, fontBold, 8, colorNegro, leftX, rightX);

    // Líneas decorativas superiores
    page.drawLine({
      start: { x: leftX + 25, y: topY - 45 },
      end: { x: rightX - 25, y: topY - 45 },
      thickness: 1.8,
      color: colorAzulHeader,
    });
    page.drawLine({
      start: { x: leftX + 25, y: topY - 50 },
      end: { x: rightX - 25, y: topY - 50 },
      thickness: 3,
      color: rgb(0.05, 0.15, 0.3),
    });

    // 3. Cajas: No. de Empleado y Nombre
    const yCajas = topY - 118;
    const altoCajas = 50;

    // Caja Izquierda: No. de Empleado
    const wCajaId = 140;
    const xCajaId = leftX + 25;
    page.drawRectangle({
      x: xCajaId,
      y: yCajas,
      width: wCajaId,
      height: altoCajas,
      borderColor: colorNegro,
      borderWidth: 1,
    });
    this.drawCenteredText(page, 'No. de empleado', yCajas + 33, fontBold, 10.5, colorNegro, xCajaId, xCajaId + wCajaId);
    this.drawCenteredText(page, data.numeroEmpleado || '', yCajas + 12, fontBold, 12, colorNegro, xCajaId, xCajaId + wCajaId);

    // Caja Derecha: Nombre
    const xCajaNombre = leftX + 180;
    const wCajaNombre = boxWidth - 205;
    page.drawRectangle({
      x: xCajaNombre,
      y: yCajas,
      width: wCajaNombre,
      height: altoCajas,
      borderColor: colorNegro,
      borderWidth: 1,
    });
    this.drawCenteredText(page, 'Nombre', yCajas + 33, fontBold, 10.5, colorNegro, xCajaNombre, xCajaNombre + wCajaNombre);
    
    // Auto-ajuste de tamaño de fuente si el nombre es extenso
    const nombreTxt = (data.nombreCompleto || 'COLABORADOR').toUpperCase();
    const tamanoFuenteNombre = nombreTxt.length > 32 ? 9 : 10.5;
    this.drawCenteredText(page, nombreTxt, yCajas + 13, fontBold, tamanoFuenteNombre, colorNegro, xCajaNombre, xCajaNombre + wCajaNombre);

    // 4. Subtítulo: Retardos y Horario de Entrada
    const textoEntrada = `Retardos (Hora de Entrada: ${data.horaEntradaProgramada || '08:00'})`;
    this.drawCenteredText(page, textoEntrada, topY - 138, fontBold, 10, colorNegro, leftX, rightX);

    // 5. Caja central de incidencias
    const yCajaIncidencias = topY - 265;
    const altoCajaIncidencias = 118;
    const xCajaIncidencias = leftX + 25;
    const wCajaIncidencias = boxWidth - 50;

    page.drawRectangle({
      x: xCajaIncidencias,
      y: yCajaIncidencias,
      width: wCajaIncidencias,
      height: altoCajaIncidencias,
      borderColor: colorNegro,
      borderWidth: 1,
    });

    // Mes y Año en la cabecera interior del recuadro
    this.drawCenteredText(
      page, 
      (data.mesAnio || '').toUpperCase(), 
      yCajaIncidencias + altoCajaIncidencias - 16, 
      fontBold, 
      10.5, 
      colorNegro, 
      xCajaIncidencias, 
      xCajaIncidencias + wCajaIncidencias
    );

    // 6. Listado dinámico de incidencias en 2 columnas balanceadas (<<F1>> <<F2>>)
    const mitadAncho = wCajaIncidencias / 2;
    const col1MinX = xCajaIncidencias;
    const col1MaxX = xCajaIncidencias + mitadAncho;
    const col2MinX = xCajaIncidencias + mitadAncho;
    const col2MaxX = xCajaIncidencias + wCajaIncidencias;

    let lineaY = yCajaIncidencias + altoCajaIncidencias - 32;
    const items = data.horasIncidencias || [];

    for (let idx = 0; idx < items.length; idx += 2) {
      // Columna 1
      this.drawCenteredText(page, items[idx], lineaY, fontBold, 9, colorNegro, col1MinX, col1MaxX);

      // Columna 2 (si existe)
      if (idx + 1 < items.length) {
        this.drawCenteredText(page, items[idx + 1], lineaY, fontBold, 9, colorNegro, col2MinX, col2MaxX);
      }

      lineaY -= 13;
      // Límite de seguridad visual dentro de la caja
      if (lineaY < yCajaIncidencias + 6) break;
    }

    // 7. Pie de firma
    const yFirma = bottomY + 24;
    page.drawLine({
      start: { x: leftX + 30, y: yFirma + 16 },
      end: { x: rightX - 30, y: yFirma + 16 },
      thickness: 0.8,
      color: colorNegro,
    });

    this.drawCenteredText(page, 'FIRMA DE CONFORMIDAD Y ENTERADO', yFirma + 5, fontBold, 9, colorNegro, leftX, rightX);
    this.drawCenteredText(page, '(NOMBRE COMPLETO DEL EMPLEADO Y FIRMA)', yFirma - 6, fontBold, 9, colorNegro, leftX, rightX);
  }

  /**
   * Centra un texto dentro de un rango horizontal (minX a maxX)
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