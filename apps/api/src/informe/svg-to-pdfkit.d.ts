// svg-to-pdfkit no trae tipos: dibuja un SVG (texto) en un documento de pdfkit.
declare module 'svg-to-pdfkit' {
  export default function SVGtoPDF(doc: PDFKit.PDFDocument, svg: string, x: number, y: number, opciones?: { width?: number; height?: number }): void;
}
