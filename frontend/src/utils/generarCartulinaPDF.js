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

export const generarCartulinaPDF = (prestamo, cuotas) => {
    if (!prestamo || !cuotas || cuotas.length === 0) {
        alert("No hay datos para generar el PDF.");
        return;
    }
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text("ANUBIS", 14, 20);
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text("Cartulina de Control de Pago", 14, 28);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Cliente: ${prestamo.clientes?.nombre || 'Sin nombre'}`, 14, 35);

    const esPeriodico = prestamo.tipo_prestamo === 'mensual_interes';
    const totalMostrado = esPeriodico ? prestamo.monto_capital : prestamo.monto_total;

    doc.text(`Total a Pagar: $${totalMostrado}`, 14, 41);

    const modalidad = esPeriodico ? 'Mensual (Solo Interés)' : (prestamo.frecuencia ? prestamo.frecuencia.charAt(0).toUpperCase() + prestamo.frecuencia.slice(1) : 'Diario');
    doc.text(`Modalidad: ${modalidad}`, 14, 47);
    doc.text(`Valor de Cuota: $${prestamo.valor_cuota}`, 14, 53);

    const tableColumn = ["#", "Fecha", "Estado", "Motivo"];
    const tableRows = [];

    cuotas.forEach((c, index) => {
        let estadoTexto = 'Pendiente';
        if (c.estado_cobro === 'pagado') estadoTexto = 'Pagado';
        else if (c.estado_cobro === 'no_pago') estadoTexto = 'Atrasado';
        else if (c.estado_cobro === 'renovado') estadoTexto = 'Renovado';

        tableRows.push([
            index + 1,
            c.fecha_cobro,
            estadoTexto,
            c.notas || ''
        ]);
    });

    autoTable(doc, {
        startY: 58,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 25 }, 2: { cellWidth: 25 }, 3: { cellWidth: 'auto' } }
    });

    agregarPaginacion(doc);
    doc.save(`Cartulina_${prestamo.clientes?.nombre?.replace(/\s+/g, '_')}_${prestamo.fecha_inicio}.pdf`);
};