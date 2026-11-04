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

export const generarReporteGananciasPDF = async (fechaDesde, fechaHasta) => {
    // 1. Traer pagos en el rango para detectar préstamos fijos cerrados/renovados
    const { data: pagos } = await supabase
        .from('historial_pagos')
        .select(`fecha_cobro, prestamos!inner(id, interes_total, estado, clientes(nombre))`)
        .in('estado_cobro', ['pagado', 'renovado'])
        .gte('fecha_cobro', fechaDesde)
        .lte('fecha_cobro', fechaHasta);

    // 2. Traer pagos de interés puro de libretas en el rango
    const { data: movimientos } = await supabase
        .from('movimientos_mensuales')
        .select(`fecha, monto, prestamos(clientes(nombre))`)
        .eq('tipo', 'pago_interes')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta);

    let transacciones = [];
    let totalGanancia = 0;
    const prestamosContabilizados = new Set();

    // Procesar préstamos fijos (Diarios/Semanales)
    if (pagos) {
        pagos.forEach(pago => {
            const prestamo = pago.prestamos;
            // Solo contamos la ganancia si el préstamo se liquidó o renovó
            if (prestamo.estado === 'completado' || prestamo.estado === 'renovado') {
                if (!prestamosContabilizados.has(prestamo.id)) {
                    prestamosContabilizados.add(prestamo.id);
                    const interes = Number(prestamo.interes_total);
                    totalGanancia += interes;

                    transacciones.push({
                        fecha: pago.fecha_cobro,
                        cliente: prestamo.clientes?.nombre || 'Desconocido',
                        concepto: `Crédito Fijo - ${prestamo.estado === 'completado' ? 'Liquidado' : 'Renovado'}`,
                        monto: interes
                    });
                }
            }
        });
    }

    // Procesar préstamos de libreta (Mensuales)
    if (movimientos) {
        movimientos.forEach(mov => {
            const interes = Number(mov.monto);
            totalGanancia += interes;

            transacciones.push({
                fecha: mov.fecha,
                cliente: mov.prestamos?.clientes?.nombre || 'Desconocido',
                concepto: 'Abono a Interés (Libreta)',
                monto: interes
            });
        });
    }

    if (transacciones.length === 0) {
        alert("No hay ganancias registradas (préstamos cerrados o intereses pagados) en este rango de fechas.");
        return;
    }

    // Ordenar cronológicamente
    transacciones.sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Construir PDF
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

    // Resumen Superior (Igual a la interfaz)
    doc.setFillColor(254, 252, 232); // Fondo amarillo muy suave
    doc.rect(14, 40, 182, 16, 'F');
    doc.setFontSize(12);
    doc.setTextColor(217, 119, 6); // Texto ámbar oscuro
    doc.text(`Utilidad Neta del Periodo: $${totalGanancia.toFixed(2)}`, 18, 50);

    // Tabla
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
            4: { cellWidth: 25, fontStyle: 'bold', textColor: [22, 163, 74] } // Verde para la plata
        }
    });

    agregarPaginacion(doc);
    doc.save(`Anubis_Ganancias_${fechaDesde}_a_${fechaHasta}.pdf`);
};