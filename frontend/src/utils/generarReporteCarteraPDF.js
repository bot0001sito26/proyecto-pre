import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import supabase from '../supabaseClient';

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
            // CORRECCIÓN: Sumamos todo el interés histórico de estos créditos sin límite de fecha
            const { data: movimientos } = await supabase
                .from('movimientos_mensuales')
                .select('monto, prestamo_id')
                .in('prestamo_id', prestamosIds)
                .eq('tipo', 'pago_interes');

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

        // CORRECCIÓN: Eliminamos el bloque que sobrescribía el interés a "$0.00 (Pendiente)"
        // para que en la tabla se vea el valor real esperado que cuadra con la sumatoria final.

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
    if (finalY + 40 > doc.internal.pageSize.getHeight()) { doc.addPage(); finalY = 20; }

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