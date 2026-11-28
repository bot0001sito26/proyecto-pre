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

export const generarReporteGananciasPDF = async (fechaDesde, fechaHasta) => {
    const [{ data: prestamosFijos }, { data: pagosFijos }, { data: movimientos }] = await Promise.all([
        supabase
            .from('prestamos')
            .select('id, monto_total, interes_total, valor_cuota, es_capital_ajeno, clientes(nombre)')
            .neq('tipo_prestamo', 'mensual_interes')
            .eq('es_capital_ajeno', false),
        supabase
            .from('historial_pagos')
            .select('id, prestamo_id, fecha_cobro, fecha_pago_real, monto_recibido, estado_cobro, prestamos!inner(es_capital_ajeno)')
            .in('estado_cobro', ['pagado', 'renovado'])
            .eq('prestamos.es_capital_ajeno', false),
        supabase
            .from('movimientos_mensuales')
            .select('fecha, monto, prestamos!inner(es_capital_ajeno, clientes(nombre))')
            .eq('tipo', 'pago_interes')
            .eq('prestamos.es_capital_ajeno', false)
            .gte('fecha', fechaDesde)
            .lte('fecha', fechaHasta)
    ]);

    const transacciones = [];
    let totalGanancia = 0;

    if (prestamosFijos && pagosFijos) {
        const pagosPorPrestamo = {};
        pagosFijos.forEach(p => {
            if (!pagosPorPrestamo[p.prestamo_id]) pagosPorPrestamo[p.prestamo_id] = [];
            pagosPorPrestamo[p.prestamo_id].push(p);
        });

        prestamosFijos.forEach(prestamo => {
            const desglose = desglosarPagosCuotaFija(prestamo, pagosPorPrestamo[prestamo.id] || []);
            desglose.forEach(item => {
                if (item.parteGanancia > 0 && item.fecha >= fechaDesde && item.fecha <= fechaHasta) {
                    totalGanancia += item.parteGanancia;
                    transacciones.push({
                        fecha: item.fecha,
                        cliente: prestamo.clientes?.nombre || 'Desconocido',
                        concepto: item.esRenovacion
                            ? 'Crédito Fijo (Ganancia liberada en renovación)'
                            : 'Cuota Fija (Excedente tras cubrir capital)',
                        monto: item.parteGanancia
                    });
                }
            });
        });
    }

    if (movimientos) {
        movimientos.forEach(mov => {
            const interes = Number(mov.monto);
            totalGanancia += interes;

            transacciones.push({
                fecha: mov.fecha,
                cliente: mov.prestamos?.clientes?.nombre || 'Desconocido',
                concepto: 'Pago de Interés (Libreta)',
                monto: interes
            });
        });
    }

    if (transacciones.length === 0) {
        alert("No hay ganancias liberadas en este rango de fechas.");
        return;
    }

    transacciones.sort((a, b) => a.fecha.localeCompare(b.fecha));

    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text("ANUBIS", 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text("Reporte de Ganancias (Interés Realizado)", 14, 28);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Desde: ${fechaDesde}   Hasta: ${fechaHasta}`, 14, 34);

    doc.setFillColor(254, 252, 232);
    doc.rect(14, 40, 182, 16, 'F');
    doc.setFontSize(12);
    doc.setTextColor(217, 119, 6);
    doc.text(`Utilidad Neta del Periodo: $${totalGanancia.toFixed(2)}`, 18, 50);

    const tableColumn = ["#", "Fecha", "Cliente", "Concepto (Origen de Ganancia)", "Interés ($)"];
    const tableRows = transacciones.map((t, index) => [
        index + 1,
        t.fecha,
        t.cliente,
        t.concepto,
        `$${t.monto.toFixed(2)}`
    ]);

    autoTable(doc, {
        startY: 62,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 25 },
            2: { cellWidth: 60 },
            3: { cellWidth: 60 },
            4: { cellWidth: 25, fontStyle: 'bold', textColor: [22, 163, 74] }
        }
    });

    agregarPaginacion(doc);
    doc.save(`Anubis_Ganancias_${fechaDesde}_a_${fechaHasta}.pdf`);
};