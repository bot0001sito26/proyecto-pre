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

export const generarReporteCajaPDF = async (fechaDesde, fechaHasta) => {
    const { data: pagosFijos } = await supabase
        .from('historial_pagos')
        .select('fecha_cobro, monto_recibido, prestamos(clientes(nombre))')
        .eq('estado_cobro', 'pagado')
        .gte('fecha_cobro', fechaDesde)
        .lte('fecha_cobro', fechaHasta);

    const { data: movimientosLibreta } = await supabase
        .from('movimientos_mensuales')
        .select('fecha, tipo, monto, prestamos(clientes(nombre))')
        .in('tipo', ['pago_interes', 'abono_capital'])
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta);

    let transacciones = [];
    let totalCuotas = 0;
    let totalCapital = 0;
    let totalInteres = 0;

    if (pagosFijos) {
        pagosFijos.forEach(p => {
            const monto = Number(p.monto_recibido || 0);
            totalCuotas += monto;
            transacciones.push({
                fecha: p.fecha_cobro,
                cliente: p.prestamos?.clientes?.nombre || 'Desconocido',
                tipo: 'Cuota Fija',
                monto: monto
            });
        });
    }

    if (movimientosLibreta) {
        movimientosLibreta.forEach(m => {
            const monto = Number(m.monto || 0);
            const esInteres = m.tipo === 'pago_interes';

            if (esInteres) totalInteres += monto;
            else totalCapital += monto;

            transacciones.push({
                fecha: m.fecha,
                cliente: m.prestamos?.clientes?.nombre || 'Desconocido',
                tipo: esInteres ? 'Pago de Interés' : 'Abono a Capital',
                monto: monto
            });
        });
    }

    if (transacciones.length === 0) {
        alert("No hay ingresos registrados en este rango de fechas.");
        return;
    }

    transacciones.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const totalGeneral = totalCuotas + totalCapital + totalInteres;

    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text("ANUBIS", 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text("Reporte de Ingresos (Cierre de Caja)", 14, 28);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Desde: ${fechaDesde}   Hasta: ${fechaHasta}`, 14, 34);

    doc.setFillColor(249, 250, 251);
    doc.rect(14, 40, 182, 22, 'F');
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text(`Total Físico Recaudado: $${totalGeneral.toFixed(2)}`, 18, 47);
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Cuotas Fijas: $${totalCuotas.toFixed(2)}  |  Interés (Libreta): $${totalInteres.toFixed(2)}  |  Capital Recuperado: $${totalCapital.toFixed(2)}`, 18, 55);

    const tableColumn = ["#", "Fecha", "Cliente", "Tipo de Ingreso", "Monto ($)"];
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
                if (tipo === 'Pago de Interés') data.cell.styles.textColor = [22, 163, 74];
                else if (tipo === 'Abono a Capital') data.cell.styles.textColor = [217, 119, 6];
                else data.cell.styles.textColor = [37, 99, 235];
            }
        }
    });

    agregarPaginacion(doc);
    doc.save(`Anubis_Caja_${fechaDesde}_a_${fechaHasta}.pdf`);
};