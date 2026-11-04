import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const agregarPaginacion = (doc) => {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
    }
};

export const generarReporteRutaPDF = (pagos, fecha, totalEsperado, totalCobrado) => {
    if (!pagos || pagos.length === 0) {
        alert("No hay datos para exportar.");
        return;
    }
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text("ANUBIS", 14, 20);
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Reporte de Ruta - Fecha: ${fecha}`, 14, 28);

    const tableColumn = ["#", "Cliente", "Teléfono", "Mod.", "Cuota", "Cant.", "Total", "Estado", "Motivo"];
    const tableRows = [];

    pagos.forEach((p, index) => {
        let estadoTexto = 'Pendiente';
        if (p.estado_cobro === 'pagado') estadoTexto = 'Pagado';
        else if (p.estado_cobro === 'no_pago') estadoTexto = 'Atrasado';
        else if (p.estado_cobro === 'al_dia') estadoTexto = 'Al Día';

        const esPeriodico = p.prestamos.tipo_prestamo === 'mensual_interes';
        const modalidadTexto = esPeriodico ? 'Mensual' : (p.prestamos.frecuencia ? p.prestamos.frecuencia.charAt(0).toUpperCase() + p.prestamos.frecuencia.slice(1, 4) : 'Diar');

        const cuotaBase = Number(p.prestamos.valor_cuota).toFixed(2);
        const totalPagado = Number(p.monto_recibido).toFixed(2);

        let cantidadCuotas = '-';
        if (estadoTexto === 'Pagado') {
            cantidadCuotas = p.cuotasPagadasHoy || Math.max(1, Math.round(Number(p.monto_recibido) / Number(p.prestamos.valor_cuota)));
        }

        const motivoTexto = p.notas || '';

        tableRows.push([
            index + 1,
            p.prestamos.clientes.nombre,
            p.prestamos.clientes.telefono || 'S/N',
            modalidadTexto,
            `$${cuotaBase}`,
            cantidadCuotas,
            `$${totalPagado}`,
            estadoTexto,
            motivoTexto
        ]);
    });

    autoTable(doc, {
        startY: 35,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
            0: { cellWidth: 8 }, 1: { cellWidth: 35 }, 2: { cellWidth: 20 },
            3: { cellWidth: 15 }, 4: { cellWidth: 15 }, 5: { cellWidth: 12, halign: 'center' },
            6: { cellWidth: 18, fontStyle: 'bold' }, 7: { cellWidth: 18 }, 8: { cellWidth: 'auto' }
        },
        didParseCell: function (data) {
            if (data.section === 'body') {
                if (data.row.raw[7] === 'Pagado') {
                    data.cell.styles.fillColor = [240, 253, 244];
                    if (data.column.index === 6) data.cell.styles.textColor = [22, 163, 74];
                } else if (data.row.raw[7] === 'Al Día') {
                    data.cell.styles.fillColor = [239, 246, 255];
                    data.cell.styles.textColor = [30, 64, 175];
                }
            }
        }
    });

    let finalY = doc.lastAutoTable?.finalY || 35;
    if (finalY + 30 > doc.internal.pageSize.getHeight()) { doc.addPage(); finalY = 20; }

    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text(`Total Esperado: $${Number(totalEsperado).toFixed(2)}`, 14, finalY + 15);
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129);
    doc.text(`Dinero Físico Ingresado (Total Cobrado): $${Number(totalCobrado).toFixed(2)}`, 14, finalY + 25);

    agregarPaginacion(doc);
    doc.save(`Anubis_Ruta_${fecha}.pdf`);
};