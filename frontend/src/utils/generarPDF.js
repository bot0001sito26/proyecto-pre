import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import supabase from '../supabaseClient';

// Función auxiliar para agregar Paginación
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

    const tableColumn = ["#", "Cliente", "Teléfono", "Mod.", "Cuota", "Cant.", "Total", "Estado", "Motivo"];
    const tableRows = [];

    pagos.forEach((p, index) => {
        let estadoTexto = 'Pendiente';
        if (p.estado_cobro === 'pagado') estadoTexto = 'Pagado';
        else if (p.estado_cobro === 'no_pago') estadoTexto = 'Atrasado';
        else if (p.estado_cobro === 'al_dia') estadoTexto = 'Al Día'; // <--- AGREGADO AQUI

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
            0: { cellWidth: 8 },
            1: { cellWidth: 35 },
            2: { cellWidth: 20 },
            3: { cellWidth: 15 },
            4: { cellWidth: 15 },
            5: { cellWidth: 12, halign: 'center' },
            6: { cellWidth: 18, fontStyle: 'bold' },
            7: { cellWidth: 18 },
            8: { cellWidth: 'auto' }
        },
        didParseCell: function (data) {
            if (data.section === 'body') {
                if (data.row.raw[7] === 'Pagado') {
                    data.cell.styles.fillColor = [240, 253, 244]; // Verde suave
                    if (data.column.index === 6) data.cell.styles.textColor = [22, 163, 74];
                } else if (data.row.raw[7] === 'Al Día') {
                    data.cell.styles.fillColor = [239, 246, 255]; // Azul suave
                    data.cell.styles.textColor = [30, 64, 175]; // Letra azul oscura
                }
            }
        }
    });

    let finalY = doc.lastAutoTable?.finalY || 35;
    if (finalY + 30 > doc.internal.pageSize.getHeight()) {
        doc.addPage();
        finalY = 20;
    }

    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text(`Total Esperado: $${Number(totalEsperado).toFixed(2)}`, 14, finalY + 15);
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129);
    doc.text(`Dinero Físico Ingresado (Total Cobrado): $${Number(totalCobrado).toFixed(2)}`, 14, finalY + 25);

    agregarPaginacion(doc);
    doc.save(`Anubis_Ruta_${fecha}.pdf`);
};

// Reporte de Cartera / Cortes
export const generarReporteCarteraPDF = async (prestamos, fechaDesde, fechaHasta) => {
    if (!prestamos || prestamos.length === 0) {
        alert("No hay préstamos registrados para este reporte.");
        return;
    }

    const esModoTodosLosActivos = fechaDesde === 'INICIO';
    let totalInteresMovimientosPeriodicos = 0;

    if (!esModoTodosLosActivos) {
        const prestamosIds = prestamos.map(p => p.id);
        if (prestamosIds.length > 0) {
            const { data: movimientos } = await supabase
                .from('movimientos_mensuales')
                .select('monto, prestamo_id')
                .in('prestamo_id', prestamosIds)
                .eq('tipo', 'pago_interes')
                .gte('fecha', fechaDesde)
                .lte('fecha', fechaHasta);

            if (movimientos) {
                totalInteresMovimientosPeriodicos = movimientos.reduce((sum, m) => sum + Number(m.monto || 0), 0);
            }
        }
    }

    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text("ANUBIS", 14, 20);
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);

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
        const esPeriodico = p.tipo_prestamo === 'mensual_interes';

        let fechaFinEstimada = 'Indefinido';
        if (!esPeriodico) {
            const fecha = new Date(p.fecha_inicio + 'T12:00:00');
            if (p.frecuencia === 'diario') fecha.setDate(fecha.getDate() + 30);
            else if (p.frecuencia === 'semanal') fecha.setDate(fecha.getDate() + 28);
            else if (p.frecuencia === 'quincenal') fecha.setDate(fecha.getDate() + 30);
            else if (p.frecuencia === 'mensual') fecha.setDate(fecha.getDate() + 30);
            fechaFinEstimada = fecha.toISOString().split('T')[0];
        }

        let estadoRealParaElCorte = p.estado;
        if ((p.estado === 'completado' || p.estado === 'renovado') && !esModoTodosLosActivos) {
            if (p.fecha_cierre && p.fecha_cierre > fechaHasta) {
                estadoRealParaElCorte = 'activo';
            }
        }

        if (estadoRealParaElCorte === 'activo') {
            totalCapital += Number(p.monto_capital);
            totalInteresEsperado += Number(p.interes_total || p.valor_cuota || 0);
        }

        let estadoTexto = 'Activo';
        let interesFilaDisplay = esPeriodico ? `$${Number(p.valor_cuota || p.interes_total || 0).toFixed(2)} /mes` : `$${Number(p.interes_total || 0).toFixed(2)}`;

        if (estadoRealParaElCorte === 'completado') {
            estadoTexto = 'Liquidado';
            if (!esPeriodico) totalInteresCobrado += Number(p.interes_total || 0);
        } else if (estadoRealParaElCorte === 'renovado') {
            estadoTexto = 'Renovado';
            if (!esPeriodico) totalInteresCobrado += Number(p.interes_total || 0);
        }

        if (!esModoTodosLosActivos && estadoRealParaElCorte === 'activo' && !esPeriodico) {
            interesFilaDisplay = '$0.00 (Pendiente)';
        }

        const modalidadTexto = esPeriodico ? 'Mensual (Interés)' : (p.frecuencia ? p.frecuencia.charAt(0).toUpperCase() + p.frecuencia.slice(1) : 'Diario');

        tableRows.push([
            index + 1,
            p.clientes?.nombre || 'Sin nombre',
            p.fecha_inicio,
            modalidadTexto,
            fechaFinEstimada,
            estadoTexto,
            `$${Number(p.monto_capital).toFixed(2)}`,
            interesFilaDisplay
        ]);
    });

    if (!esModoTodosLosActivos) {
        totalInteresCobrado += totalInteresMovimientosPeriodicos;
    }

    autoTable(doc, {
        startY: 40,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: { 0: { cellWidth: 12 }, 7: { cellWidth: 22 } },
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
        doc.text(`Total Interés Esperado Proyectado (Fijos + Periódicos): $${totalInteresEsperado.toFixed(2)}`, 14, finalY + 20);
    } else {
        doc.text(`Interés Esperado (Proyección): $${totalInteresEsperado.toFixed(2)}`, 14, finalY + 18);
        doc.setFontSize(12);
        doc.setTextColor(245, 158, 11);
        doc.text(`Interés Liquidado (Ganancia Real Total): $${totalInteresCobrado.toFixed(2)}`, 14, finalY + 26);
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