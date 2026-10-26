import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Función auxiliar para agregar Paginación a cualquier PDF generado
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

// Reporte de Ruta Diaria
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

    // Se agrega Modalidad y Motivo
    const tableColumn = ["#", "Cliente", "Teléfono", "Modalidad", "Cuota ($)", "Estado", "Motivo"];
    const tableRows = [];

    pagos.forEach((p, index) => {
        let estadoTexto = 'Pendiente';
        if (p.estado_cobro === 'pagado') estadoTexto = 'Pagado';
        else if (p.estado_cobro === 'no_pago') estadoTexto = 'Atrasado';

        const modalidadTexto = p.prestamos.frecuencia ? p.prestamos.frecuencia.charAt(0).toUpperCase() + p.prestamos.frecuencia.slice(1) : 'Diario';
        const motivoTexto = p.notas || '';

        tableRows.push([
            index + 1,
            p.prestamos.clientes.nombre,
            p.prestamos.clientes.telefono || 'Sin Número',
            modalidadTexto,
            `$${p.prestamos.valor_cuota}`,
            estadoTexto,
            motivoTexto
        ]);
    });

    autoTable(doc, {
        startY: 35,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: { 0: { cellWidth: 10 }, 6: { cellWidth: 'auto' } } // Motivo toma el espacio restante
    });

    let finalY = doc.lastAutoTable?.finalY || 35;

    // Si la tabla terminó muy abajo, creamos una nueva página para los totales
    if (finalY + 30 > doc.internal.pageSize.getHeight()) {
        doc.addPage();
        finalY = 20;
    }

    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text(`Total Esperado: $${totalEsperado.toFixed(2)}`, 14, finalY + 15);
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129);
    doc.text(`Total Cobrado: $${totalCobrado.toFixed(2)}`, 14, finalY + 25);

    agregarPaginacion(doc);
    doc.save(`Anubis_Ruta_${fecha}.pdf`);
};

// Reporte de Cartera / Cortes
export const generarReporteCarteraPDF = (prestamos, fechaDesde, fechaHasta) => {
    if (!prestamos || prestamos.length === 0) {
        alert("No hay préstamos registrados para este reporte.");
        return;
    }
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text("ANUBIS", 14, 20);
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);

    const esModoTodosLosActivos = fechaDesde === 'INICIO';
    doc.text(esModoTodosLosActivos ? "Reporte de Cartera Activa Global" : "Reporte de Cartera (Corte)", 14, 28);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Desde: ${fechaDesde}   Hasta: ${fechaHasta}`, 14, 34);

    const tableColumn = ["#", "Cliente", "Inicio", "Modalidad", "Fin (Est.)", "Estado", "Capital ($)", "Interés ($)"];
    const tableRows = [];

    let totalCapital = 0;
    let totalInteresEsperado = 0;
    let totalInteresCobrado = 0;

    const prestamosOrdenados = [...prestamos].sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));

    prestamosOrdenados.forEach((p, index) => {
        const fecha = new Date(p.fecha_inicio + 'T12:00:00');
        if (p.frecuencia === 'diario') fecha.setDate(fecha.getDate() + 30);
        else if (p.frecuencia === 'semanal') fecha.setDate(fecha.getDate() + 28);
        else if (p.frecuencia === 'quincenal') fecha.setDate(fecha.getDate() + 30);
        else if (p.frecuencia === 'mensual') fecha.setDate(fecha.getDate() + 30);
        const fechaFinEstimada = fecha.toISOString().split('T')[0];

        totalCapital += Number(p.monto_capital);
        totalInteresEsperado += Number(p.interes_total);

        let estadoTexto = 'Activo';
        let interesFilaDisplay = Number(p.interes_total);

        if (p.estado === 'completado') {
            estadoTexto = 'Liquidado';
            totalInteresCobrado += Number(p.interes_total);
        } else if (p.estado === 'renovado') {
            estadoTexto = 'Renovado';
            totalInteresCobrado += Number(p.interes_total);
        } else if (!esModoTodosLosActivos) {
            interesFilaDisplay = 0;
        }

        const modalidadTexto = p.frecuencia ? p.frecuencia.charAt(0).toUpperCase() + p.frecuencia.slice(1) : 'Diario';

        tableRows.push([
            index + 1,
            p.clientes?.nombre || 'Sin nombre',
            p.fecha_inicio,
            modalidadTexto,
            fechaFinEstimada,
            estadoTexto,
            `$${Number(p.monto_capital).toFixed(2)}`,
            `$${interesFilaDisplay.toFixed(2)}`
        ]);
    });

    autoTable(doc, {
        startY: 40,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: { 0: { cellWidth: 8 } },
        didParseCell: function (data) {
            if (data.section === 'body' && (data.row.raw[5] === 'Liquidado' || data.row.raw[5] === 'Renovado')) {
                data.cell.styles.fillColor = [220, 252, 231];
                data.cell.styles.textColor = [22, 163, 74];
            }
        }
    });

    let finalY = doc.lastAutoTable?.finalY || 40;

    if (finalY + 40 > doc.internal.pageSize.getHeight()) {
        doc.addPage();
        finalY = 20;
    }

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Capital Total Prestado: $${totalCapital.toFixed(2)}`, 14, finalY + 12);

    if (esModoTodosLosActivos) {
        doc.setFontSize(12);
        doc.setTextColor(245, 158, 11);
        doc.text(`Total Interés Esperado Proyectado: $${totalInteresEsperado.toFixed(2)}`, 14, finalY + 20);
    } else {
        doc.text(`Interés Esperado (Proyección): $${totalInteresEsperado.toFixed(2)}`, 14, finalY + 18);
        doc.setFontSize(12);
        doc.setTextColor(245, 158, 11);
        doc.text(`Interés Cobrado (Ganancia Real): $${totalInteresCobrado.toFixed(2)}`, 14, finalY + 26);
    }

    agregarPaginacion(doc);
    doc.save(`Anubis_Cartera_${fechaDesde}_a_${fechaHasta}.pdf`);
};

// Reporte de Cartulina Modal
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
    doc.text(`Total a Pagar: $${prestamo.monto_total}`, 14, 41);

    const modalidad = prestamo.frecuencia ? prestamo.frecuencia.charAt(0).toUpperCase() + prestamo.frecuencia.slice(1) : 'Diario';
    doc.text(`Modalidad: ${modalidad}`, 14, 47);
    doc.text(`Valor de Cuota: $${prestamo.valor_cuota}`, 14, 53);

    // Cambiado de "Nota / Excusa" a "Motivo"
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
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 25 }, 2: { cellWidth: 25 }, 3: { cellWidth: 'auto' } }
    });

    agregarPaginacion(doc);
    doc.save(`Cartulina_${prestamo.clientes?.nombre?.replace(/\s+/g, '_')}_${prestamo.fecha_inicio}.pdf`);
};