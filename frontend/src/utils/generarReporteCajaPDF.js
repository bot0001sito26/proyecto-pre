import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import supabase from '../supabaseClient';
import { desglosarPagosCuotaFija } from './finanzasCalculos';

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

export const generarReporteCajaPDF = async (fechaDesde, fechaHasta) => {
    const [{ data: prestamosFijos }, { data: pagosFijos }, { data: movimientosLibreta }] = await Promise.all([
        supabase
            .from('prestamos')
            .select('id, monto_total, interes_total, valor_cuota, es_capital_ajeno, clientes(nombre)')
            .neq('tipo_prestamo', 'mensual_interes')
            .eq('es_capital_ajeno', false),
        supabase
            .from('historial_pagos')
            .select('id, prestamo_id, fecha_cobro, fecha_pago_real, monto_recibido, estado_cobro, prestamos!inner(es_capital_ajeno)')
            .eq('estado_cobro', 'pagado')
            .eq('prestamos.es_capital_ajeno', false),
        supabase
            .from('movimientos_mensuales')
            .select('fecha, tipo, monto, prestamos!inner(es_capital_ajeno, clientes(nombre))')
            .in('tipo', ['pago_interes', 'abono_capital'])
            .eq('prestamos.es_capital_ajeno', false)
            .gte('fecha', fechaDesde)
            .lte('fecha', fechaHasta)
    ]);

    const transacciones = [];
    let totalCapitalRecuperado = 0;
    let totalInteresCobrado = 0;

    if (prestamosFijos && pagosFijos) {
        const pagosPorPrestamo = {};
        pagosFijos.forEach(p => {
            if (!pagosPorPrestamo[p.prestamo_id]) pagosPorPrestamo[p.prestamo_id] = [];
            pagosPorPrestamo[p.prestamo_id].push(p);
        });

        prestamosFijos.forEach(prestamo => {
            const desglose = desglosarPagosCuotaFija(prestamo, pagosPorPrestamo[prestamo.id] || []);
            desglose.forEach(item => {
                if (item.fecha >= fechaDesde && item.fecha <= fechaHasta) {
                    totalCapitalRecuperado += item.parteCapital;
                    totalInteresCobrado += item.parteGanancia;

                    let etiquetaTipo = 'Cuota (Capital)';
                    if (item.parteCapital > 0 && item.parteGanancia > 0) etiquetaTipo = 'Cuota (Cap. + Int.)';
                    else if (item.parteGanancia > 0) etiquetaTipo = 'Cuota (Ganancia)';

                    transacciones.push({
                        fecha: item.fecha,
                        cliente: prestamo.clientes?.nombre || 'Desconocido',
                        tipo: etiquetaTipo,
                        monto: item.monto
                    });
                }
            });
        });
    }

    if (movimientosLibreta) {
        movimientosLibreta.forEach(m => {
            const monto = Number(m.monto || 0);
            const esInteres = m.tipo === 'pago_interes';

            if (esInteres) totalInteresCobrado += monto;
            else totalCapitalRecuperado += monto;

            transacciones.push({
                fecha: m.fecha,
                cliente: m.prestamos?.clientes?.nombre || 'Desconocido',
                tipo: esInteres ? 'Pago de Interés' : 'Abono a Capital',
                monto
            });
        });
    }

    if (transacciones.length === 0) {
        alert("No hay ingresos propios registrados en este rango de fechas.");
        return;
    }

    transacciones.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const totalGeneral = totalCapitalRecuperado + totalInteresCobrado;

    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text("ANUBIS", 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text("Reporte de Ingresos a Caja Única (Dinero Propio)", 14, 28);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Desde: ${fechaDesde}   Hasta: ${fechaHasta}`, 14, 34);

    doc.setFillColor(249, 250, 251);
    doc.rect(14, 40, 182, 22, 'F');
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text(`Total Físico Ingresado a Caja: $${totalGeneral.toFixed(2)}`, 18, 47);
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Capital Recuperado (Rotativo): $${totalCapitalRecuperado.toFixed(2)}   |   Interés Liberado (Ganancia): $${totalInteresCobrado.toFixed(2)}`, 18, 55);

    const tableColumn = ["#", "Fecha", "Cliente", "Destino en Caja", "Monto ($)"];
    const tableRows = transacciones.map((t, index) => [
        index + 1, t.fecha, t.cliente, t.tipo, `$${t.monto.toFixed(2)}`
    ]);

    autoTable(doc, {
        startY: 68,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
            0: { cellWidth: 12 }, 1: { cellWidth: 25 }, 2: { cellWidth: 70 },
            3: { cellWidth: 40 }, 4: { cellWidth: 25, fontStyle: 'bold' }
        },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 3) {
                const tipo = data.cell.raw;
                if (tipo.includes('Ganancia') || tipo === 'Pago de Interés') data.cell.styles.textColor = [22, 163, 74];
                else if (tipo.includes('Cap. + Int.')) data.cell.styles.textColor = [217, 119, 6];
                else data.cell.styles.textColor = [37, 99, 235];
            }
        }
    });

    agregarPaginacion(doc);
    doc.save(`Anubis_Caja_${fechaDesde}_a_${fechaHasta}.pdf`);
};